async function waitForSupabase() {
    let retries = 0;
    while ((!window.supabase || typeof window.supabase.from !== "function") && retries < 30) {
        await new Promise((r) => setTimeout(r, 200));
        retries++;
    }
}

document.addEventListener('alpine:init', () => {
    Alpine.data('beaconApp', () => ({
        currentPage: 'dashboard',
        loading: true,
        refreshing: false,
        announcements: [],
        userReports: [],
        searchTerm: '',
        dateFilter: '',
        statusFilter: '',
        userBrgy: null,
        selectedItem: null,
        userName: 'Guest',
        userInitials: 'G',
        userRole: 'User',
        navItems: [
            { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', url: 'index.html' },
            { id: 'calendar', label: 'Calendar', icon: 'calendar_month', url: 'calendar.html' },
            { id: 'report', label: 'Report', icon: 'report', url: 'report.html' },
            { id: 'map', label: 'Map', icon: 'map', url: 'map.html' },
            { id: 'notifications', label: 'Notifications', icon: 'notifications', url: 'notification.html' },
        ],

        async init() {
            const dashboardPromise = this.loadDashboard();
            supabase.auth.onAuthStateChange(async (event, session) => {
                if (session?.user) {
                    this.userBrgy = Alpine.store('auth').user?.barangay;
                } else {
                    this.resetUser();
                }
            });

            await dashboardPromise;
            this.subscribeToRealtime();
            this.handleUrlFocus();
        },

        async loadDashboard() {
            this.loading = true;
            const localCache = localStorage.getItem('announcements_cache');
            if (localCache) this.announcements = JSON.parse(localCache);
            const { data, error } = await supabase
                .from("announcements")
                .select("*, feeders(name), announcement_images(image_url)")
                .order("created_at", { ascending: false });
            if (!error) {
                this.announcements = data;
                localStorage.setItem('announcements_cache', JSON.stringify(data));
            }
            this.loading = false;
        },

        async loadUserReports(userId) {
            const { data } = await supabase
                .from("reports")
                .select("*, barangays(name)")
                .eq('user_id', userId)
                .order("created_at", { ascending: false });
            this.userReports = data || [];
        },

        subscribeToRealtime() {
            supabase.channel('dashboard-feed')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, async (payload) => {
                if (payload.eventType === 'INSERT') {
                    const { data } = await supabase.from("announcements").select("*, feeders(name), announcement_images(image_url)").eq('id', payload.new.id).single();
                    this.announcements.unshift(data);
                } else if (payload.eventType === 'UPDATE') {
                    const idx = this.announcements.findIndex(a => a.id === payload.new.id);
                    if (idx !== -1) Object.assign(this.announcements[idx], payload.new);
                } else if (payload.eventType === 'DELETE') {
                    this.announcements = this.announcements.filter(a => a.id !== payload.old.id);
                }
                }).subscribe();
        },

        get processedAnnouncements() {
            let list = this.announcements.filter(item => {
                const searchStr = (item.cause + item.location + item.description + (item.feeders?.name || '')).toLowerCase();
                const matchesSearch = !this.searchTerm || searchStr.includes(this.searchTerm.toLowerCase());
                const matchesStatus = !this.statusFilter || item.status === this.statusFilter;
                return matchesSearch && matchesStatus;
            });

            return list.sort((a, b) => {
                const getScore = (item) => {
                const isRelevant = item.barangay === this.userBrgy;
                if (!isRelevant) return 0;
                return (item.status === 'Reported' || item.status === 'Ongoing') ? 100 : 50;
                };
                return getScore(b) - getScore(a) || new Date(b.created_at) - new Date(a.created_at);
            });
        },

        showPage(pageId) { this.currentPage = pageId; },
        openDetails(item) { this.selectedItem = item; },
        isUserArea(item) { return item.barangay === this.userBrgy; },
        formatDate(d) { return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); },
        formatStatus(status) {
            if (!status || typeof status !== 'string') return "N/A"; 
            return status.charAt(0).toUpperCase() + status.slice(1);
        },
        getShortDescription(description) {
            return (description || 'No description').substring(0, 100) + (description && description.length > 150 ? '...' : '');
        },
        resetUser() {
            this.userReports = [];
            this.userBrgy = null;
            this.userName = 'Guest';
            this.userInitials = 'G';
        },
        shareItem(item) {
            if (navigator.share) {
                navigator.share({ title: item.cause, text: item.description, url: window.location.href + '?focus_announcement=' + item.id });
            }
        },
        handleUrlFocus() {
            const params = new URLSearchParams(window.location.search);
            const focusId = params.get('focus_announcement');
            if (focusId) {
                setTimeout(() => {
                    const el = document.getElementById('announcement-' + focusId);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 500);
            }
        }
    }));
});