const SUPABASE_URL = 'https://ziuteulziywsangbnkgn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppdXRldWx6aXl3c2FuZ2Jua2duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NjQ4NDQsImV4cCI6MjA3NzQ0MDg0NH0.X2LkaDdouutbHWzotkMNEIdoJBfB9v1CtMQ7KZTXilk'; // replace with real key

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('alpine:init', () => {
    Alpine.store('auth', {
        user: JSON.parse(localStorage.getItem('currentUser')) || null,
        isGuest: localStorage.getItem('guest') === 'true',
        isLoaded: false,

        async init() {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                await this.refreshProfile(session.user);
            }
            this.isLoaded = true;
            
            supabase.auth.onAuthStateChange(async (event, session) => {
                if (session?.user) {
                    await this.refreshProfile(session.user);
                } else if (event === 'SIGNED_OUT') {
                    this.clear();
                }
            });
        },

        async refreshProfile(authUser) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', authUser.id)
                .single();

            this.user = {
                id: authUser.id,
                email: authUser.email,
                firstName: profile?.first_name || '',
                lastName: profile?.last_name || '',
                mobile: profile?.mobile || '',
                barangay: profile?.barangay || '',
                avatar: profile?.profile_picture || null,
                initials: ((profile?.first_name?.[0] || '') + (profile?.last_name?.[0] || '')).toUpperCase() || 'U'
            };
            console.log('User profile loaded:', this.user);
            localStorage.setItem('currentUser', JSON.stringify(this.user));
        },

        clear() {
            this.user = null;
            this.isGuest = false;
            localStorage.removeItem('currentUser');
            localStorage.removeItem('guest');
        }
    });

    Alpine.store('ui', {
        profileModalOpen: false,
        alert: { show: false, message: '', type: 'info' },
        currentPage: window.location.pathname.split('/').pop() || 'index.html',
        
        showAlert(msg, type = 'info') {
            this.alert = { show: true, message: msg, type };
            if (type !== 'error') setTimeout(() => this.alert.show = false, 3000);
        }
    });
});