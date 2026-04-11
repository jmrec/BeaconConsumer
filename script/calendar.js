document.addEventListener('DOMContentLoaded', () => {
    const state = {
        currentMonth: new Date().getMonth(),
        currentYear: new Date().getFullYear(),
        selectedDate: new Date(),
        outages: [],
        isLoading: true,
        userBarangay: null // Store user's barangay
    };

    const els = {
        calendarContainer: document.querySelector('.calendar-container'),
        calendarHeader: document.querySelector('.calendar-header'),
        calendarDays: document.getElementById('calendar-days'),
        dateTitle: document.getElementById('selected-date-title'),
        reportsContainer: document.getElementById('date-reports-container')
    };

    async function init() {
        setupHeaderStructure();
        renderCalendar();
        renderDetails(state.selectedDate);

        const supabaseReady = await waitForSupabase();
        if (supabaseReady) {
            await fetchUserProfile(); // New Step: Get user context
            await fetchScheduledOutages();
        } else {
            if(els.reportsContainer) els.reportsContainer.innerHTML = `<div class="no-outages-message">System offline.</div>`;
        }
    }

    async function waitForSupabase(timeout = 5000, interval = 200) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (window.supabase) return true;
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        return false;
    }

    // NEW: Fetch User Profile for Filtering
    async function fetchUserProfile() {
        try {
            const { data: { user } } = await window.supabase.auth.getUser();
            if (user) {
                const { data: profile } = await window.supabase
                    .from('profiles')
                    .select('barangay')
                    .eq('id', user.id)
                    .single();
                
                if (profile && profile.barangay && profile.barangay !== 'Not set') {
                    // Ensure we are checking the name. If ID is stored, we might need to fetch the name from 'barangays' table.
                    // Assuming 'profiles.barangay' stores the text name based on your context.
                    // If it stores ID, we'd need an extra fetch here. 
                    // For now, we assume it's the text name to match 'areas_affected'.
                    
                    // If it is a number (ID), try to resolve it (Optional safety)
                    if (!isNaN(profile.barangay)) {
                         const { data: bData } = await window.supabase
                            .from('barangays')
                            .select('name')
                            .eq('id', profile.barangay)
                            .single();
                         if(bData) state.userBarangay = bData.name;
                    } else {
                        state.userBarangay = profile.barangay;
                    }
                }
            }
        } catch (err) {
            console.warn("Could not load user profile for calendar filtering", err);
        }
    }

    function setupHeaderStructure() {
        const header = document.querySelector('.calendar-header');
        if(!header) return;

        header.innerHTML = `
            <div class="calendar-nav">
                <span class="calendar-year-text" id="year-display">${state.currentYear}</span>
                <div class="calendar-month-row">
                    <button id="prev-month-btn" class="nav-btn"><span class="material-symbols-outlined">chevron_left</span></button>
                    <h2 id="current-month">Month</h2>
                    <button id="next-month-btn" class="nav-btn"><span class="material-symbols-outlined">chevron_right</span></button>
                </div>
            </div>
            <div class="today-btn" style="color: #059669; font-weight: 500; font-size: 14px; padding-top: 12px; cursor: pointer; text-align: center;">Return to Today</div>
        `;

        document.getElementById('prev-month-btn').onclick = () => changeMonth(-1);
        document.getElementById('next-month-btn').onclick = () => changeMonth(1);
        header.querySelector('.today-btn').onclick = () => {
            const today = new Date();
            state.currentMonth = today.getMonth();
            state.currentYear = today.getFullYear();
            state.selectedDate = today;
            renderCalendar();
            renderDetails(state.selectedDate);
        };
    }

    function changeMonth(offset) {
        state.currentMonth += offset;
        if(state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; } 
        else if(state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
        renderCalendar();
    }

    async function fetchScheduledOutages() {
        state.isLoading = true;
        renderDetails(state.selectedDate);
        try {
            const supabase = window.supabase;
            
            // UPDATED QUERY: Exclude completed
            const { data: announcements, error } = await supabase
                .from('announcements')
                .select('*')
                .eq('type', 'scheduled')
                .neq('status', 'Completed') // Remove completed
                .neq('status', 'completed') // Safety for lowercase
                .not('scheduled_at', 'is', null)
                .order('scheduled_at', { ascending: true });

            if (error) throw error;

            let results = announcements || [];

            // UPDATED FILTERING: Filter by User Barangay if set
            if (state.userBarangay) {
                const target = state.userBarangay.toLowerCase();
                
                results = results.filter(outage => {
                    // 1. Check main barangay field
                    const mainMatch = (outage.barangay || '').toLowerCase().includes(target);
                    
                    // 2. Check areas_affected array
                    const areaMatch = Array.isArray(outage.areas_affected) && 
                                      outage.areas_affected.some(area => area.toLowerCase().includes(target));
                    
                    return mainMatch || areaMatch;
                });
            }

            state.outages = results;

        } catch (err) {
            console.error('💥 Fetch error:', err);
        } finally {
            state.isLoading = false;
            renderCalendar();
            renderDetails(state.selectedDate);
        }
    }

    function renderCalendar() {
        const daysContainer = document.getElementById('calendar-days');
        if (!daysContainer) return;
        daysContainer.innerHTML = '';

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        document.getElementById('current-month').textContent = monthNames[state.currentMonth];
        document.getElementById('year-display').textContent = state.currentYear;

        const firstDay = new Date(state.currentYear, state.currentMonth, 1).getDay();
        const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();
        const today = new Date();

        // Empty slots for previous month
        for(let i = 0; i < firstDay; i++) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'calendar-day empty';
            emptyEl.style.visibility = 'hidden'; // Clean empty look
            daysContainer.appendChild(emptyEl);
        }

        // Render Days
        for(let i = 1; i <= daysInMonth; i++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            
            const thisDate = new Date(state.currentYear, state.currentMonth, i);

            // 1. Add Date Number
            const dateNum = document.createElement('span');
            dateNum.className = 'day-number';
            dateNum.textContent = i;
            dayEl.appendChild(dateNum);

            // 2. Find Outages
            const dailyOutages = state.outages.filter(outage => {
                if (!outage.scheduled_at) return false;
                return isSameDay(new Date(outage.scheduled_at), thisDate);
            });

            if(dailyOutages.length > 0) {
                dayEl.classList.add('has-outage');
                
                // --- ELEMENT A: MOBILE DOT ---
                const mobileDot = document.createElement('div');
                mobileDot.className = 'mobile-outage-dot';
                dayEl.appendChild(mobileDot);

                // --- ELEMENT B: DESKTOP PILL ---
                dailyOutages.forEach(outage => {
                    const time = new Date(outage.scheduled_at).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'});
                    
                    const pill = document.createElement('div');
                    pill.className = 'outage-pill';
                    // Just Time + "Scheduled"
                    pill.innerHTML = `${time} Scheduled`; 
                    dayEl.appendChild(pill);
                });
            }

            // 3. Selection Logic
            // Only apply 'current' if it is today
            if(isSameDay(thisDate, today)) {
                dayEl.classList.add('current');
            }
            // Apply 'selected' if clicked (can be both current and selected)
            if(isSameDay(thisDate, state.selectedDate)) {
                dayEl.classList.add('selected');
            }

            dayEl.onclick = () => {
                state.selectedDate = thisDate;
                renderCalendar(); // Re-render to update styling
                renderDetails(thisDate);
            };

            daysContainer.appendChild(dayEl);
        }
    }

    function renderDetails(date) {
        const container = document.getElementById('date-reports-container');
        const title = document.getElementById('selected-date-title');
        if (!container || !title) return;

        const options = { month: 'long', day: 'numeric', year: 'numeric' };
        title.textContent = isSameDay(date, new Date()) ? "Today's Schedule" : `Schedule for ${date.toLocaleDateString('en-US', options)}`;

        if (state.isLoading) {
            container.innerHTML = `<div class="no-outages-message">Loading schedule...</div>`;
            return;
        }

        const daily = state.outages.filter(outage => isSameDay(new Date(outage.scheduled_at), date));

        if(daily.length === 0) {
            container.innerHTML = `<div class="no-outages-message">No scheduled outages for this date.</div>`;   //pinadagdag ni sir/maam
            return;
        }

        // MODERN TILE HTML STRUCTURE
        container.innerHTML = daily.map(outage => {
            const start = new Date(outage.scheduled_at);
            const end = outage.estimated_restoration_at ? new Date(outage.estimated_restoration_at) : null;
            
            return `
            <div class="outage-card">
                <div class="card-header">
                    <div>
                        <span class="outage-type-badge">Scheduled Maintenance</span>
                        <h3 class="outage-title">${outage.description || 'System Maintenance'}</h3>
                    </div>
                    <span class="status-pill">${outage.status || 'Scheduled'}</span>
                </div>
                
                <div class="card-body">
                    <div class="info-row">
                        <span class="material-symbols-outlined">location_on</span>
                        <span>${outage.location || outage.barangay || 'Multiple Areas'}</span>
                    </div>
                    <div class="info-row">
                        <span class="material-symbols-outlined">schedule</span>
                        <span>
                            <strong>${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</strong>
                            ${end ? ` - ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : ''}
                        </span>
                    </div>
                    ${outage.cause ? `
                    <div class="info-row">
                        <span class="material-symbols-outlined">info</span>
                        <span>${outage.cause}</span>
                    </div>` : ''}
                </div>

                ${(outage.areas_affected && outage.areas_affected.length > 0) ? `
                <div class="areas-container">
                    <strong>Affected Areas:</strong> ${outage.areas_affected.join(', ')}
                </div>` : ''}
            </div>
            `;
        }).join('');
    }

    function isSameDay(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
    }

    init();
});