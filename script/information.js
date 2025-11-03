// Information Page Functions
function initializeInformation() {
    // This would typically load specific report data based on URL parameters
    // For demo, we'll use the first report
    if (reports.length > 0) {
        displayReportInfo(reports[0]);
    }
}

function displayReportInfo(report) {
    // Update the information page with report details
    document.querySelector('.feeder-info').textContent = `${report.feeder} | ${report.area}`;
    document.querySelector('.status').textContent = formatStatus(report.status);
    document.querySelector('.status').className = `status status-${report.status}`;
    document.querySelector('.affected-areas').textContent = report.affectedAreas.join(', ');
    
    const startTime = new Date(report.startTime);
    document.querySelectorAll('.info-detail')[0].querySelector('span:last-child').textContent = 
        `${formatTime(report.startTime)}, ${formatDate(report.startTime)}`;
    
    document.querySelectorAll('.info-detail')[1].querySelector('span:last-child').textContent = report.cause;
    document.querySelectorAll('.info-detail')[2].querySelector('span:last-child').textContent = formatStatus(report.status);
    
    if (report.eta) {
        document.querySelectorAll('.info-detail')[3].querySelector('span:last-child').textContent = 
            `${formatTime(report.eta)} (${calculateTimeRemaining(report.startTime, report.eta)})`;
    } else {
        document.querySelectorAll('.info-detail')[3].querySelector('span:last-child').textContent = 'To be determined';
    }
}

function viewReportDetail(reportId) {
    // Navigate to information page with the specific report
    window.location.href = `information.html?report=${reportId}`;
}
