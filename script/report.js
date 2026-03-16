document.addEventListener('alpine:init', () => {
    Alpine.data('reportApp', () => ({
        isFormOpen: false,
        submitting: false,
        reports: [],
        barangayList: [],
        causes: ['Flickering', 'No Power', 'Damaged Line', 'Fallen Tree', 'Others'],
        
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
        
        form: {
            barangay_id: '',
            outage_time: new Date().toISOString().slice(0, 16),
            cause: '',
            description: '',
            is_urgent: false,
            contact_permission: false
        },
        uploadedImages: [],
        imagePreviews: [],

        async init() {
            await waitForSupabase();
            this.loadBarangays();
            this.loadDraft();

            supabase.auth.onAuthStateChange(async (event, session) => {
                if (session?.user) {
                    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                    this.userName = profile?.full_name || 'User';
                    this.userInitials = this.userName.split(' ').map(n => n[0]).join('');
                    this.loadReports(session.user.id);
                    this.subscribeToRealtime(session.user.id);
                    
                    // Auto-fill barangay if not set
                    if (!this.form.barangay_id) this.form.barangay_id = profile?.barangay;
                }
            });

            this.$watch('form', (val) => localStorage.setItem('report_draft', JSON.stringify(val)));
        },

        async loadBarangays() {
            const { data } = await supabase.from('barangays').select('*').order('name');
            this.barangayList = data || [];
        },

        async loadReports(userId) {
            const { data } = await supabase.from('reports').select('*, barangays(name)').eq('user_id', userId).order('created_at', { ascending: false });
            this.reports = data || [];
        },

        subscribeToRealtime(userId) {
            supabase.channel('my-reports').on('postgres_changes', { event: '*', table: 'reports', filter: `user_id=eq.${userId}` }, () => {
                this.loadReports(userId);
            }).subscribe();
        },

        handleImageSelection(e) {
            const files = Array.from(e.target.files);
            if (this.uploadedImages.length + files.length > 5) return alert("Max 5 images.");
            
            files.forEach(file => {
                this.uploadedImages.push(file);
                const reader = new FileReader();
                reader.onload = (res) => this.imagePreviews.push(res.target.result);
                reader.readAsDataURL(file);
            });
        },

        async submitReport() {
            if (!this.form.barangay_id || !this.form.cause || this.form.description.length < 10) {
                return alert("Please fill in all required fields accurately.");
            }

            this.submitting = true;
            try {
                const { data: { user } } = await supabase.auth.getUser();
                
                const sentiment = await calculateReportSentiment(this.form.description);

                const { data: report, error } = await supabase.from('reports').insert([{
                    user_id: user.id,
                    barangay: this.form.barangay_id,
                    cause: this.form.cause,
                    description: this.form.description,
                    sentiment_score: sentiment,
                    status: 'pending'
                }]).select().single();

                if (error) throw error;

                for (const file of this.uploadedImages) {
                    const path = `reports/${user.id}/${report.id}/${Date.now()}_${file.name}`;
                    await supabase.storage.from('report_images').upload(path, file);
                    const { data: url } = supabase.storage.from('report_images').getPublicUrl(path);
                    await supabase.from('report_images').insert([{ report_id: report.id, image_url: url.publicUrl }]);
                }

                this.resetForm();
                this.isFormOpen = false;
                alert("✅ Report Submitted Successfully");
            } catch (err) {
                console.error(err);
                alert("Error submitting report.");
            } finally {
                this.submitting = false;
            }
        },

        resetForm() {
            this.form = { barangay_id: '', cause: '', description: '', is_urgent: false };
            this.uploadedImages = [];
            this.imagePreviews = [];
            localStorage.removeItem('report_draft');
        },

        loadDraft() {
            const draft = localStorage.getItem('report_draft');
            if (draft) Object.assign(this.form, JSON.parse(draft));
        },

        formatDateTime(d) {
            return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }
    }));
});