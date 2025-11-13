// ==============================
// Global Variables & Constants
// ==============================
let reportSubscriptionChannel = null;
let lastSubmissionTime = 0;
const SUBMISSION_COOLDOWN = 30000; // 30 seconds
let uploadedImages = []; // Array to store multiple images
const MAX_IMAGES = 5;

// ==============================
// Wait for Supabase Initialization
// ==============================
async function waitForSupabase() {
  let retries = 0;
  while ((!window.supabase || typeof window.supabase.from !== "function") && retries < 30) {
    await new Promise((r) => setTimeout(r, 200));
    retries++;
  }
  if (!window.supabase || typeof window.supabase.from !== "function") {
    console.error("❌ Supabase failed to initialize after waiting.");
    throw new Error("Supabase not ready");
  }
  console.log("✅ Supabase is ready");
}

// ==============================
// Populate Barangay Dropdown
// ==============================
async function loadBarangays() {
  const barangaySelect = document.getElementById("barangay-select");
  if (!barangaySelect) return;

  barangaySelect.innerHTML = `<option value="">Loading barangays...</option>`;

  try {
    await waitForSupabase();
    const { data, error } = await supabase.from("barangays").select("*").order("name", { ascending: true });
    if (error) throw error;

    barangaySelect.innerHTML = `<option value="">Select Barangay</option>`;
    data.forEach((barangay) => {
      const option = document.createElement("option");
      option.value = barangay.id;
      option.textContent = barangay.name;
      barangaySelect.appendChild(option);
    });
    console.log("✅ Barangays loaded:", data.length);
  } catch (err) {
    console.error("Error loading barangays:", err);
    barangaySelect.innerHTML = `<option value="">Failed to load</option>`;
  }
}

// ==============================
// Initialize Report Page
// ==============================
document.addEventListener("DOMContentLoaded", async () => {
  await waitForSupabase();
  await loadBarangays();
  loadUserReports();
  initializeReportForm();
  setupCloseButtons();
  setupKeyboardShortcuts();
  loadReportDraft();
  
  // Listen for authentication changes
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth event:", event);
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      loadUserReports();
      subscribeToReportUpdates(session.user.id);
    } else if (event === 'SIGNED_OUT') {
      const container = document.getElementById("user-reports-container");
      if (container) {
          container.innerHTML = `<p>Please log in to see your reports.</p>`;
      }
      if (reportSubscriptionChannel) {
        supabase.removeChannel(reportSubscriptionChannel);
        reportSubscriptionChannel = null;
        console.log("📡 Unsubscribed from report updates.");
      }
    }
  });
});

// ==============================
// Load Reports for Logged-in User
// ==============================
async function loadUserReports() {
  const container = document.getElementById("user-reports-container");
  if (!container) return;

  container.innerHTML = `<p>Loading your reports...</p>`;

  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      container.innerHTML = `<p>Please log in to see your reports.</p>`;
      return;
    }

    const { data, error } = await supabase
      .from("reports")
      .select("*, barangays ( name )")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="material-symbols-outlined">description</span>
          <p>No previous reports</p>
          <p class="empty-state-detail">Your outage reports will appear here</p>
        </div>`;
      return;
    }

    container.innerHTML = data
      .map(
        (report) => `
        <div class="report-card" data-id="${report.id}">
          <!-- Status Highlight Bar -->
          <div class="status-highlight status-${report.status || 'pending'}"></div>
          <div class="report-header">
            <div class="feeder-info">${report.barangays?.name || "N/A"}</div>
            <div class="status-container">
              <div class="status status-${report.status || "pending"}">${report.status || "Pending"}</div>
              <div class="report-actions">
                <button class="three-dots-btn" data-report-id="${report.id}">
                  <span class="material-symbols-outlined">more_vert</span>
                </button>
              </div>
            </div>
          </div>
          <div class="report-date">Reported: ${new Date(report.outage_time).toLocaleString()}</div>
          <div class="report-description">${report.description || ""}</div>
        </div>`
      )
      .join("");

    // Add click event for report cards
    document.querySelectorAll(".report-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        // Don't trigger if clicking the three dots button
        if (!e.target.closest('.three-dots-btn')) {
          showReportDetails(card.dataset.id);
        }
      });
    });

    // Add event listeners for three dots buttons
    document.querySelectorAll(".three-dots-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent card click
        showReportActionsMenu(btn.dataset.reportId, btn);
      });
    });

  } catch (err) {
    console.error("Error loading user reports:", err);
    container.innerHTML = `<p>Failed to load reports.</p>`;
  }
}

// ==============================
// Report Actions Menu (Three Dots)
// ==============================
function showReportActionsMenu(reportId, buttonElement) {
  // Remove any existing menus
  const existingMenu = document.querySelector('.report-actions-menu');
  if (existingMenu) existingMenu.remove();

  const menu = document.createElement('div');
  menu.className = 'report-actions-menu';
  menu.style.cssText = `
    position: absolute;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    padding: 8px 0;
    z-index: 1000;
    min-width: 120px;
  `;

  menu.innerHTML = `
    <button class="action-item delete-report" style="
      width: 100%;
      padding: 8px 16px;
      border: none;
      background: none;
      text-align: left;
      cursor: pointer;
      color: #e74c3c;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    ">
      <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
      Delete
    </button>
  `;

  // Position the menu near the button
  const rect = buttonElement.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;

  document.body.appendChild(menu);

  // Handle delete action
  menu.querySelector('.delete-report').addEventListener('click', () => {
    deleteReport(reportId);
    menu.remove();
  });

  // Close menu when clicking outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target) && e.target !== buttonElement) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);
}

// ==============================
// Delete Report Function
// ==============================
async function deleteReport(reportId) {
  if (!confirm('Are you sure you want to delete this report? This action cannot be undone.')) {
    return;
  }

  try {
    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', reportId);

    if (error) throw error;

    console.log('✅ Report deleted successfully');
    loadUserReports(); // Reload the reports list
  } catch (err) {
    console.error('❌ Error deleting report:', err);
    alert('Failed to delete report. Please try again.');
  }
}

// ==============================
// Listen for Realtime Report Updates
// ==============================
function subscribeToReportUpdates(userId) {
  if (reportSubscriptionChannel) {
    return;
  }
  
  if (!userId) {
    console.log("No user ID, skipping subscription.");
    return;
  }

  console.log("📡 Subscribing to report updates for user:", userId);

  reportSubscriptionChannel = supabase
    .channel('public:reports')
    .on(
      'postgres_changes',
      { 
        event: '*',
        schema: 'public',
        table: 'reports',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        console.log('✅ Realtime update received!', payload);
        loadUserReports();
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Successfully subscribed to report updates!');
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Subscription error:', err);
        supabase.removeChannel(reportSubscriptionChannel);
        reportSubscriptionChannel = null;
        
        // Attempt to resubscribe after delay
        setTimeout(() => subscribeToReportUpdates(userId), 5000);
      }
    });
}

// ==============================
// Initialize Report Form
// ==============================
function initializeReportForm() {
  const causeButtons = document.querySelectorAll(".toggle-button");
  const selectedCauseInput = document.getElementById("selected-cause");

  causeButtons.forEach((button) => {
    button.addEventListener("click", function () {
      causeButtons.forEach((btn) => btn.classList.remove("active"));
      this.classList.add("active");
      selectedCauseInput.value = this.getAttribute("data-cause");
      saveReportDraft();
    });
  });

  // Enhanced image upload handling
  const imageUpload = document.getElementById("image-upload");
  const imageInput = document.getElementById("image-input");
  
  if (imageUpload && imageInput) {
    // Remove existing event listeners to prevent duplicates
    imageUpload.replaceWith(imageUpload.cloneNode(true));
    imageInput.replaceWith(imageInput.cloneNode(true));
    
    const newImageUpload = document.getElementById("image-upload");
    const newImageInput = document.getElementById("image-input");

    newImageUpload.addEventListener("click", () => {
      if (uploadedImages.length < MAX_IMAGES) {
        newImageInput.click();
      } else {
        alert(`Maximum ${MAX_IMAGES} images allowed`);
      }
    });

    newImageUpload.addEventListener("dragover", (e) => {
      e.preventDefault();
      newImageUpload.classList.add("dragover");
    });

    newImageUpload.addEventListener("dragleave", () => {
      newImageUpload.classList.remove("dragover");
    });

    newImageUpload.addEventListener("drop", (e) => {
      e.preventDefault();
      newImageUpload.classList.remove("dragover");
      if (uploadedImages.length < MAX_IMAGES) {
        handleImageUpload(e.dataTransfer.files[0]);
      } else {
        alert(`Maximum ${MAX_IMAGES} images allowed`);
      }
    });

    newImageInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0 && uploadedImages.length < MAX_IMAGES) {
        handleImageUpload(e.target.files[0]);
        // Clear the input to allow selecting the same file again
        e.target.value = '';
      } else if (uploadedImages.length >= MAX_IMAGES) {
        alert(`Maximum ${MAX_IMAGES} images allowed`);
      }
    });
  }

  // Form field change listeners for draft saving
  const formFields = ['barangay-select', 'outage-time', 'outage-description', 'latitude', 'longitude'];
  formFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('change', saveReportDraft);
      field.addEventListener('input', saveReportDraft);
    }
  });

  const gpsToggle = document.getElementById("geolocation");
  if (gpsToggle) {
    gpsToggle.addEventListener("change", () => {
      if (gpsToggle.checked) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            document.getElementById("latitude").value = pos.coords.latitude;
            document.getElementById("longitude").value = pos.coords.longitude;
            saveReportDraft();
            console.log("📍 Location captured:", pos.coords);
          },
          (err) => {
            alert("Failed to get location. Please allow GPS access.");
            gpsToggle.checked = false;
          }
        );
      } else {
        document.getElementById("latitude").value = "";
        document.getElementById("longitude").value = "";
        saveReportDraft();
      }
    });
  }

  const submitButton = document.getElementById("submit-report");
  if (submitButton) submitButton.addEventListener("click", submitOutageReport);

  // Add Cancel button
  const existingCancel = document.getElementById("cancel-report");
  if (!existingCancel && submitButton) {
    const cancelBtn = document.createElement("button");
    cancelBtn.id = "cancel-report";
    cancelBtn.textContent = "Cancel";
    cancelBtn.type = "button";
    cancelBtn.classList.add("cancel-button");
    cancelBtn.style.cssText = `
      margin-top:10px;
      width:100%;
      padding:10px;
      background:#eee;
      color:#333;
      border:none;
      border-radius:8px;
      font-weight:bold;
      cursor:pointer;
    `;
    submitButton.insertAdjacentElement("afterend", cancelBtn);

    cancelBtn.addEventListener("click", () => {
      resetReportForm();
      showPage("report");
    });
  }
}

// ==============================
// Enhanced Image Upload Handling (Multiple Images)
// ==============================
function handleImageUpload(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Please select a valid image file (JPEG, PNG, GIF)");
    return;
  }

  // Check file size (5MB limit)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    alert("Image must be smaller than 5MB");
    return;
  }

  if (uploadedImages.length >= MAX_IMAGES) {
    alert(`Maximum ${MAX_IMAGES} images allowed`);
    return;
  }

  uploadedImages.push(file);
  updateImagePreview();
  saveReportDraft();
}

function removeImage(index) {
  uploadedImages.splice(index, 1);
  updateImagePreview();
  saveReportDraft();
}

function updateImagePreview() {
  const preview = document.getElementById("image-preview");
  if (!preview) return;

  if (uploadedImages.length === 0) {
    preview.innerHTML = "";
    return;
  }

  let previewHTML = '<div class="image-preview-container" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">';
  
  // Show up to 3 images, then show count for rest
  const imagesToShow = Math.min(uploadedImages.length, 3);
  
  for (let i = 0; i < imagesToShow; i++) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imgElement = preview.querySelector(`[data-index="${i}"]`);
      if (imgElement) {
        imgElement.querySelector('img').src = e.target.result;
      }
    };
    reader.readAsDataURL(uploadedImages[i]);
    
    previewHTML += `
      <div class="preview-item" data-index="${i}" style="position: relative; display: inline-block;">
        <img src="" alt="Preview" style="width: 80px; height: 80px; border-radius: 8px; border: 2px solid #f1c40f; object-fit: cover;">
        <button type="button" class="remove-image" onclick="removeImage(${i})" style="
          position: absolute; 
          top: -8px; 
          right: -8px; 
          background: #e74c3c; 
          color: white; 
          border: none; 
          border-radius: 50%; 
          width: 20px; 
          height: 20px; 
          font-size: 12px; 
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        ">×</button>
      </div>
    `;
  }

  // Show +count if there are more than 3 images
  if (uploadedImages.length > 3) {
    previewHTML += `
      <div class="image-count" style="
        width: 80px; 
        height: 80px; 
        border: 2px dashed #f1c40f; 
        border-radius: 8px; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        font-weight: bold; 
        color: #f1c40f;
        background: #fffdf0;
      ">
        +${uploadedImages.length - 3}
      </div>
    `;
  }

  previewHTML += '</div>';
  preview.innerHTML = previewHTML;

  // Load the images
  for (let i = 0; i < imagesToShow; i++) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imgElement = preview.querySelector(`[data-index="${i}"] img`);
      if (imgElement) {
        imgElement.src = e.target.result;
      }
    };
    reader.readAsDataURL(uploadedImages[i]);
  }
}

// ==============================
// Form Validation
// ==============================
function validateReportForm() {
  const barangay = document.getElementById("barangay-select").value;
  const outageTime = document.getElementById("outage-time").value;
  const cause = document.getElementById("selected-cause").value;
  const description = document.getElementById("outage-description").value;

  const errors = [];
  
  if (!barangay) errors.push("Please select a barangay");
  if (!outageTime) errors.push("Please specify outage time");
  if (!cause) errors.push("Please select a cause");
  if (!description.trim()) errors.push("Please provide a description");
  if (description.length < 10) errors.push("Description must be at least 10 characters");

  return {
    isValid: errors.length === 0,
    errors
  };
}

// ==============================
// Online Status Check
// ==============================
function checkOnlineStatus() {
  if (!navigator.onLine) {
    alert("You appear to be offline. Please check your connection.");
    return false;
  }
  return true;
}

// ==============================
// Draft Report Persistence
// ==============================
function saveReportDraft() {
  const formData = {
    barangay: document.getElementById("barangay-select").value,
    outageTime: document.getElementById("outage-time").value,
    cause: document.getElementById("selected-cause").value,
    description: document.getElementById("outage-description").value,
    latitude: document.getElementById("latitude")?.value || "",
    longitude: document.getElementById("longitude")?.value || "",
    imageCount: uploadedImages.length
  };
  
  localStorage.setItem('reportDraft', JSON.stringify(formData));
}

function loadReportDraft() {
  const draft = localStorage.getItem('reportDraft');
  if (draft) {
    try {
      const formData = JSON.parse(draft);
      
      if (confirm('Would you like to continue with your draft report?')) {
        // Populate form fields
        if (formData.barangay) document.getElementById("barangay-select").value = formData.barangay;
        if (formData.outageTime) document.getElementById("outage-time").value = formData.outageTime;
        if (formData.cause) {
          document.getElementById("selected-cause").value = formData.cause;
          document.querySelectorAll(".toggle-button").forEach(btn => {
            if (btn.getAttribute("data-cause") === formData.cause) {
              btn.classList.add("active");
            }
          });
        }
        if (formData.description) document.getElementById("outage-description").value = formData.description;
        if (formData.latitude) document.getElementById("latitude").value = formData.latitude;
        if (formData.longitude) document.getElementById("longitude").value = formData.longitude;
      } else {
        localStorage.removeItem('reportDraft');
      }
    } catch (err) {
      console.error('Error loading draft:', err);
      localStorage.removeItem('reportDraft');
    }
  }
}

// ==============================
// Reset Report Form
// ==============================
function resetReportForm() {
  document.querySelector("form")?.reset();
  uploadedImages = [];
  updateImagePreview();
  
  const causeInput = document.getElementById("selected-cause");
  if (causeInput) causeInput.value = "";
  
  document.querySelectorAll(".toggle-button").forEach((btn) => btn.classList.remove("active"));
  
  const imageInput = document.getElementById("image-input");
  if (imageInput) imageInput.value = "";

  // Clear draft
  localStorage.removeItem('reportDraft');
}

// ==============================
// Submit Report
// ==============================
async function submitOutageReport() {
  // Rate limiting check
  const now = Date.now();
  if (now - lastSubmissionTime < SUBMISSION_COOLDOWN) {
    alert("Please wait 30 seconds before submitting another report");
    return;
  }

  // Online status check
  if (!checkOnlineStatus()) return;

  // Form validation
  const validation = validateReportForm();
  if (!validation.isValid) {
    alert(validation.errors.join('\n'));
    return;
  }

  const barangay = document.getElementById("barangay-select").value;
  const outageTime = document.getElementById("outage-time").value;
  const cause = document.getElementById("selected-cause").value;
  const description = document.getElementById("outage-description").value;
  const latitude = document.getElementById("latitude")?.value || null;
  const longitude = document.getElementById("longitude")?.value || null;

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    alert("Please log in to submit a report");
    return;
  }

  const submitButton = document.getElementById("submit-report");
  const originalText = submitButton.textContent;
  
  // Show loading state
  submitButton.textContent = "Submitting...";
  submitButton.disabled = true;

  try {
    const { data: reportData, error: reportError } = await supabase
      .from("reports")
      .insert([{
        user_id: user.id,
        barangay: barangay,
        outage_time: outageTime,
        cause,
        description,
        latitude,
        longitude,
        status: "pending",
      }])
      .select()
      .single();

    if (reportError) throw reportError;

    // Upload multiple images
    if (uploadedImages.length > 0) {
      for (const imageFile of uploadedImages) {
        const imagePath = `report_images/${user.id}/${reportData.id}/${Date.now()}_${imageFile.name}`;
        const { error: uploadError } = await supabase.storage.from("report_images").upload(imagePath, imageFile);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from("report_images").getPublicUrl(imagePath);

        await supabase.from("report_images").insert([{
          report_id: reportData.id,
          image_url: publicUrlData.publicUrl,
        }]);
      }
    }

    lastSubmissionTime = now;
    showConfirmationPopup("✅ Outage report submitted successfully!");
    resetReportForm();
    loadUserReports();
    showPage("report");
  } catch (err) {
    console.error("❌ Error submitting report:", err);
    alert("Failed to submit report. Please try again.");
  } finally {
    // Reset button state
    submitButton.textContent = originalText;
    submitButton.disabled = false;
  }
}

// ==============================
// Confirmation Popup (Yellow Theme)
// ==============================
function showConfirmationPopup(message) {
  const popup = document.createElement("div");
  popup.classList.add("confirmation-popup");
  popup.innerHTML = `
    <div class="popup-box" style="border:2px solid #f1c40f;background:#fff;padding:20px;border-radius:12px;max-width:300px;text-align:center;position:relative;">
      <button class="popup-close" style="position:absolute;top:8px;right:8px;background:none;border:none;font-size:18px;cursor:pointer;">×</button>
      <p style="margin:20px 0;font-weight:bold;">${message}</p>
    </div>`;
  popup.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.4);display:flex;justify-content:center;align-items:center;z-index:9999;
  `;
  document.body.appendChild(popup);

  const closeBtn = popup.querySelector(".popup-close");
  if(closeBtn) closeBtn.addEventListener("click", () => popup.remove());
  
  popup.addEventListener("click", (e) => {
    if (e.target === popup) popup.remove();
  });
  
  setTimeout(() => {
    if (document.body.contains(popup)) {
        popup.remove();
    }
  }, 2500);
}

// ==============================
// Report Details Modal
// ==============================
async function showReportDetails(reportId) {
  const { data: report, error } = await supabase
    .from("reports")
    .select("*, barangays ( name )")
    .eq("id", reportId)
    .single();
    
  if (error) {
    console.error("Error loading report details:", error);
    alert("Failed to load report details");
    return;
  }

  const { data: images } = await supabase.from("report_images").select("*").eq("report_id", reportId);

  const modal = document.createElement("div");
  modal.classList.add("report-modal");
  modal.style.cssText = `
    position:fixed;
    top:0;
    left:0;
    width:100%;
    height:100%;
    background:rgba(0,0,0,0.5);
    display:flex;
    justify-content:center;
    align-items:center;
    z-index:9999;
    overflow:auto;
    padding:20px;
    box-sizing:border-box;
  `;

  modal.innerHTML = `
    <div class="modal-content" style="
      position:relative;
      background:#fff;
      border:2px solid #f1c40f;
      border-radius:14px;
      width:100%;
      max-width:400px;
      padding:12px;
      box-sizing:border-box;
    ">
      <button class="modal-close" style="
        position:absolute;
        top:8px;
        right:8px;
        width:28px;
        height:28px;
        font-size:18px;
        font-weight:bold;
        color:#fff;
        background:#f1c40f;
        border:none;
        border-radius:50%;
        cursor:pointer;
        box-shadow:0 2px 4px rgba(0,0,0,0.3);
        z-index:10;
        display:flex;
        align-items:center;
        justify-content:center;
        line-height:1;
      ">×</button>

      ${images && images.length
        ? `<div class="report-images-container" style="
            display:flex;
            flex-direction:column;
            gap:6px;
            margin-top:12px;
          ">
            ${images.map(img => `<img src="${img.image_url}" style="width:100%;border-radius:8px;border:2px solid #f1c40f;">`).join("")}
          </div>`
        : `<p style='margin-top:12px;color:#888;'>No images uploaded.</p>`
      }

      <div class="report-details" style="padding-top:12px;">
        <p><strong>Barangay:</strong> ${report.barangays?.name || "N/A"}</p>
        <p><strong>Reported On:</strong> ${new Date(report.outage_time).toLocaleString()}</p>
        <p><strong>Cause:</strong> ${report.cause}</p>
        <p><strong>Description:</strong> ${report.description}</p>
        <p><strong>Status:</strong> <span class="status status-${report.status}">${report.status}</span></p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

// ==============================
// Close Buttons Setup
// ==============================
function setupCloseButtons() {
  const closeFormBtn = document.getElementById("close-report-form");
  if (closeFormBtn) {
    closeFormBtn.addEventListener("click", () => {
        resetReportForm();
        showPage("report");
    });
  }
}

// ==============================
// Keyboard Shortcuts
// ==============================
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Escape key to close modals
    if (e.key === 'Escape') {
      const modal = document.querySelector('.report-modal');
      if (modal) modal.remove();
      
      const popup = document.querySelector('.confirmation-popup');
      if (popup) popup.remove();

      const actionsMenu = document.querySelector('.report-actions-menu');
      if (actionsMenu) actionsMenu.remove();
    }
  });
}

// ==============================
// Page Switcher Helper
// ==============================
function showPage(pageId) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  const newPage = document.getElementById(pageId);
  if (newPage) {
    newPage.classList.add("active");
  }
  if (pageId === "report-form") {
    initializeReportForm(); 
  }
}