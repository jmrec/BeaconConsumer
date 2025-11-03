// Notification Functions
function initializeNotifications() {
    loadNotifications();
}

function loadNotifications() {
    const container = document.getElementById('notifications-container');
    if (!container) return;
    
    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">notifications_off</span>
                <p>No notifications</p>
                <p class="empty-state-detail">You're all caught up!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = notifications.map(notification => `
        <div class="notification-card" onclick="viewNotificationDetail(${notification.id})">
            <div class="notification-icon">
                <span class="material-symbols-outlined">${notification.icon}</span>
            </div>
            <div class="notification-content">
                <div class="notification-title">${notification.title}</div>
                <div class="notification-detail">${notification.detail}</div>
                <div class="notification-time">${notification.time}</div>
            </div>
        </div>
    `).join('');
}

function viewNotificationDetail(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification || !notification.fullDetail) return;

    const overlay = document.getElementById('notification-modal-overlay');
    if (!overlay) return;

    const titleEl = overlay.querySelector('.notification-modal-title');
    const subtitleEl = overlay.querySelector('.notification-modal-subtitle');
    const contentEl = overlay.querySelector('.notification-modal-content');
    const messageEl = overlay.querySelector('.notification-modal-message');

    titleEl.textContent = notification.fullDetail.title || notification.title;
    subtitleEl.textContent = notification.fullDetail.subtitle || '';

    // Build details
    const parts = [];
    const d = notification.fullDetail;
    parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">DATE:</div><div class="notification-detail-value">${d.date || '-'}</div></div>`);
    parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">TIME STARTED:</div><div class="notification-detail-value">${d.timeStarted || '-'}</div></div>`);
    parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">RESTORATION ETA:</div><div class="notification-detail-value">${d.restorationEstimate || 'TBD'}</div></div>`);
    if (d.timeRestored) parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">TIME RESTORED:</div><div class="notification-detail-value">${d.timeRestored}</div></div>`);
    parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">PURPOSE:</div><div class="notification-detail-value">${d.purpose || '-'}</div></div>`);
    parts.push(`<div class="notification-detail-item"><div class="notification-detail-label">AREAS AFFECTED:</div><div class="notification-detail-value">${d.affectedAreas || '-'}</div></div>`);

    contentEl.innerHTML = parts.join('');
    messageEl.innerHTML = `<p>${d.message || ''}</p>`;

    overlay.classList.add('active');

    // close on overlay click
    overlay.addEventListener('click', function onOverlayClick(e) {
        if (e.target === overlay) {
            closeNotificationModal();
            overlay.removeEventListener('click', onOverlayClick);
        }
    });
}

function closeNotificationModal() {
    const overlay = document.getElementById('notification-modal-overlay');
    if (overlay) overlay.classList.remove('active');
}

function adminCreateNotification(data) {
    const nextId = notifications.length ? Math.max(...notifications.map(n => n.id)) + 1 : 1;
    const icons = { maintenance: 'power', outage: 'warning', info: 'info' };
    const notif = {
        id: nextId,
        type: data.type || 'info',
        icon: icons[data.type] || 'info',
        title: data.title || 'Notification',
        detail: data.detail || '',
        time: data.time || 'Just now',
        fullDetail: data.fullDetail || null
    };
    notifications.unshift(notif);
    try { localStorage.setItem('notifications', JSON.stringify(notifications)); } catch (e) {}
    // refresh UI if on notifications page
    try { loadNotifications(); } catch (e) {}
    return notif;
}