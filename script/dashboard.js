// Dashboard Functions
function initializeDashboard() {
    loadDashboardReports();
    
    // Search functionality
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            filterReports(e.target.value);
        });
    }
    
    // Filter functionality
    const filterSelects = document.querySelectorAll('.filter-select');
    filterSelects.forEach(select => {
        select.addEventListener('change', function() {
            filterReports();
        });
    });
}

function loadDashboardReports() {
    const container = document.getElementById('reports-container');
    if (!container) return;
    
    if (reports.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">power_off</span>
                <p>No outage reports available</p>
                <p class="empty-state-detail">Reports will appear here when admins post updates</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = reports.map(report => `
        <div class="report-card" onclick="viewReportDetail(${report.id})">
            <div class="report-header">
                <div class="feeder-info">${report.feeder} | ${report.area}</div>
                <div class="status status-${report.status}">${formatStatus(report.status)}</div>
            </div>
            <div class="report-image">
                <span class="material-symbols-outlined">image</span>
            </div>
            <div class="report-date">Started: ${formatDate(report.startTime)}</div>
        </div>
    `).join('');
}

function filterReports(searchTerm = '') {
    let filteredReports = [...reports];
    // If searchTerm not provided, read current search input value
    const searchInput = document.querySelector('.search-input');
    if (!searchTerm && searchInput) {
        searchTerm = searchInput.value.trim();
    }

    // Filter by search term (feeder or area)
    if (searchTerm) {
        filteredReports = filteredReports.filter(report => 
            report.feeder.toLowerCase().includes(searchTerm.toLowerCase()) ||
            report.area.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (report.description && report.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }

    // Filter by date input (if selected)
    const dateInput = document.querySelector('input[type="date"].filter-select');
    if (dateInput && dateInput.value) {
        // Normalize to midnight for comparison
        const selectedDate = new Date(dateInput.value);
        selectedDate.setHours(0,0,0,0);

        filteredReports = filteredReports.filter(report => {
            const rDate = new Date(report.startTime);
            rDate.setHours(0,0,0,0);
            return rDate.getTime() === selectedDate.getTime();
        });
    }

    // Filter by status (select.filter-select)
    const statusFilter = document.querySelector('select.filter-select');
    if (statusFilter && statusFilter.value && statusFilter.value !== 'All Status' && statusFilter.value !== 'Select Status') {
        filteredReports = filteredReports.filter(report => 
            report.status.toLowerCase() === statusFilter.value.toLowerCase()
        );
    }
    
    // Update display
    const container = document.getElementById('reports-container');
    if (container) {
        if (filteredReports.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-outlined">search_off</span>
                    <p>No matching reports found</p>
                </div>
            `;
        } else {
            container.innerHTML = filteredReports.map(report => `
                <div class="report-card" onclick="viewReportDetail(${report.id})">
                    <div class="report-header">
                        <div class="feeder-info">${report.feeder} | ${report.area}</div>
                        <div class="status status-${report.status}">${formatStatus(report.status)}</div>
                    </div>
                    <div class="report-image">
                        <span class="material-symbols-outlined">image</span>
                    </div>
                    <div class="report-date">Started: ${formatDate(report.startTime)}</div>
                </div>
            `).join('');
        }
    }
}