document.addEventListener('alpine:init', () => {
  Alpine.data('reportApp', () => ({
    initialized: false,
    isFormOpen: false,
    selectedReport: null,
    submitting: false,
    reports: [],
    barangayList: [],
    causes: ['Flickering', 'No Power', 'Damaged Line', 'Fallen Tree', 'Others'],
    form: {
      barangay_id: '',
      outage_time: new Date().toISOString().slice(0, 16),
      cause: '',
      description: '',
      is_urgent: false,
    },
    uploadedImages: [],
    imagePreviews: [],

    async init() {
      const { data } = await supabase.from('barangays').select('*').order('name');
      this.barangayList = data || [];

      const user = Alpine.store('auth').user;
      if (user) {
        await this.loadReports(user.id);
        if (!this.form.barangay_id) this.form.barangay_id = user.barangay;
      }

      this.loadDraft();
      this.initialized = true;
    },

    async loadReports(userId) {
      const { data } = await supabase
        .from('reports')
        .select('*, barangays(name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      this.reports = data || [];
    },

    openForm() {
      this.isFormOpen = true;
    },
    closeForm() {
      this.isFormOpen = false;
      this.resetForm();
    },

    openReportDetails(report) {
      console.log('Opening details for:', report);
      this.selectedReport = report;
    },

    handleImageSelection(e) {
      const files = Array.from(e.target.files);
      if (this.uploadedImages.length + files.length > 5) return alert('Max 5 images.');

      files.forEach((file) => {
        this.uploadedImages.push(file);
        const reader = new FileReader();
        reader.onload = (res) => this.imagePreviews.push(res.target.result);
        reader.readAsDataURL(file);
      });
    },

    async submitReport() {
      if (!this.form.barangay_id || !this.form.cause || this.form.description.length < 10) {
        return alert('Please fill in all required fields accurately.');
      }

      this.submitting = true;
      try {
        const user = Alpine.store('auth').user;
        if (!user) throw new Error('Not logged in');

        const { data: report, error } = await supabase
          .from('reports')
          .insert([
            {
              user_id: user.id,
              barangay: this.form.barangay_id,
              cause: this.form.cause,
              description: this.form.description,
              status: 'pending',
            },
          ])
          .select()
          .single();

        if (error) throw error;

        for (const file of this.uploadedImages) {
          const path = `reports/${user.id}/${report.id}/${Date.now()}_${file.name}`;
          await supabase.storage.from('report_images').upload(path, file);
          const { data: url } = supabase.storage.from('report_images').getPublicUrl(path);
          await supabase
            .from('report_images')
            .insert([{ report_id: report.id, image_url: url.publicUrl }]);
        }

        this.resetForm();
        this.isFormOpen = false;
        await this.loadReports(user.id);
        alert('✅ Report Submitted Successfully');
      } catch (err) {
        console.error(err);
        alert('Error submitting report.');
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
      return new Date(d).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
  }));
});
