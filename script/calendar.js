// Calendar Functions
function initializeCalendar() {
    generateCalendar(currentMonth, currentYear);
    loadDateReports(currentDate);
    
    // Month navigation
    document.getElementById('prev-month')?.addEventListener('click', function() {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        generateCalendar(currentMonth, currentYear);
    });
    
    document.getElementById('next-month')?.addEventListener('click', function() {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        generateCalendar(currentMonth, currentYear);
    });
}

function generateCalendar(month, year) {
    const calendarDays = document.getElementById('calendar-days');
    const currentMonthElement = document.getElementById('current-month');
    
    if (!calendarDays || !currentMonthElement) return;
    
    // Update month header
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    currentMonthElement.textContent = `${monthNames[month]} ${year}`;
    
    // Clear previous calendar
    calendarDays.innerHTML = '';
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day-header';
        dayElement.textContent = day;
        calendarDays.appendChild(dayElement);
    });
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Add empty days for previous month
    for (let i = 0; i < firstDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day other-month';
        calendarDays.appendChild(emptyDay);
    }
    
    // Add days of current month
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;
        
        // Check if this day has reports
        const dayDate = new Date(year, month, day);
        const dayReports = getReportsForDate(dayDate);
        
        if (dayReports.length > 0) {
            if (dayReports.length >= 3) {
                dayElement.classList.add('has-multiple-outages');
            } else {
                dayElement.classList.add('has-outages');
            }
        }
        
        // Highlight current day
        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            dayElement.classList.add('current');
        }
        
        // Add click event
        dayElement.addEventListener('click', function() {
            selectDate(dayDate);
        });
        
        calendarDays.appendChild(dayElement);
    }
}

function selectDate(date) {
    // Update selected date styling
    document.querySelectorAll('.calendar-day').forEach(day => {
        day.classList.remove('selected');
    });
    
    // Find and select the clicked day
    const dayElements = document.querySelectorAll('.calendar-day');
    const clickedDay = Array.from(dayElements).find(day => 
        day.textContent == date.getDate() && !day.classList.contains('other-month')
    );
    
    if (clickedDay) {
        clickedDay.classList.add('selected');
    }
    
    // Load reports for selected date
    loadDateReports(date);
}

function loadDateReports(date) {
    const container = document.getElementById('date-reports-container');
    const title = document.getElementById('selected-date-title');
    
    if (!container || !title) return;
    
    // Update title
    const formattedDate = formatDate(date);
    title.textContent = `Outages for ${formattedDate}`;
    
    // Get reports for the selected date
    const dateReports = getReportsForDate(date);
    
    if (dateReports.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">event_available</span>
                <p>No outages reported for this date</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = dateReports.map(report => `
        <div class="report-card" onclick="viewReportDetail(${report.id})">
            <div class="report-header">
                <div class="feeder-info">${report.feeder} | ${report.area}</div>
                <div class="status status-${report.status}">${formatStatus(report.status)}</div>
            </div>
            <div class="report-date">Started: ${formatTime(report.startTime)}</div>
        </div>
    `).join('');
}

function getReportsForDate(date) {
    return reports.filter(report => {
        const reportDate = new Date(report.startTime);
        return reportDate.getDate() === date.getDate() &&
               reportDate.getMonth() === date.getMonth() &&
               reportDate.getFullYear() === date.getFullYear();
    });
}