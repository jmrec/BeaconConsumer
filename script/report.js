// ==============================
// Global Variables & Constants
// ==============================
let reportSubscriptionChannel = null;
let lastSubmissionTime = 0;
const SUBMISSION_COOLDOWN = 60000; // 30 seconds
let uploadedImages = []; // Array to store multiple images
const MAX_IMAGES = 5;

/**
 * BEACON Sentiment Scoring Engine
 */
function calculateReportSentiment(text) {
    const content = text.toLowerCase();
    let score = 0;

    // --- KEYWORDS (Individual words are better than long phrases) ---
    const critical = ["consistent", "consistent", "Paulit-ulit", "ulit", "Nakakainis", "Sunog", "Nag-spark", "sparking", "umaapoy", "sumabog", "nanaman", "umay", "buset", "putik", "gago", "potangna", "binalik", "binawi", "brownout", "wala", "service", "2026"];
    const workImpact = ["hanap-buhay", "wfh", "online", "teaching", "call center", "trabaho", "night shift"];
    const damage = ["masisira", "appliances", "gamit", "surge", "airfryer", "kanin"];
    const positive = ["heroes", "salamat", "meron na", "may ilaw", "finally", "ayos", "grateful", "thank you", "ingat", "good job", "safe"];

    // --- SCORING ---
    critical.forEach(p => { if (content.includes(p)) score -= 3; });
    workImpact.forEach(p => { if (content.includes(p)) score -= 5; });
    damage.forEach(p => { if (content.includes(p)) score -= 4; });
    positive.forEach(p => { if (content.includes(p)) score += 5; });

    // Clamp for smallint DB column
    const finalScore = Math.max(-10, Math.min(10, score));
    
    // DEBUG LOG: This will show you the score in the browser console
    console.log(`📝 Sentiment Analysis: "${text}" | Result: ${finalScore}`);
    
    return finalScore;
}

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
// Populate Barangay Dropdown (Safe Mode)
// ==============================
async function loadBarangays() {
  const barangaySelect = document.getElementById("barangay-select");
  
  // 🛑 STOP: If the dropdown isn't on this page (e.g., we are on Profile), exit immediately.
  if (!barangaySelect) return; 

  // Reset to loading state
  barangaySelect.innerHTML = `<option value="">Loading...</option>`;

  try {
    await waitForSupabase();

    // 1. Fetch Barangay List (Always fetch fresh to avoid sync issues)
    const { data: barangayList, error } = await supabase
      .from("barangays")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;

    // 2. Populate Dropdown
    barangaySelect.innerHTML = `<option value="">Select Barangay</option>`;
    barangayList.forEach((barangay) => {
      const option = document.createElement("option");
      option.value = barangay.id;      
      option.textContent = barangay.name; 
      barangaySelect.appendChild(option);
    });

    // 3. Auto-Select (Only if user is logged in)
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Note: We use 'profiles' table. If your Profile Page uses 'users', ensure they match!
      const { data: userProfile } = await supabase
        .from('profiles') 
        .select('barangay') 
        .eq('id', user.id)
        .single();

      if (userProfile && userProfile.barangay) {
        const savedValue = userProfile.barangay;
        
        // Loop to find match
        for (let i = 0; i < barangaySelect.options.length; i++) {
          const option = barangaySelect.options[i];
          if (option.value == savedValue || option.textContent === savedValue) {
            barangaySelect.selectedIndex = i;
            break; 
          }
        }
      }
    }
  } catch (err) {
    // Silent fail on other pages, loud error on Report page
    if (barangaySelect) {
        console.error("Error loading barangays:", err);
        barangaySelect.innerHTML = `<option value="">Failed to load</option>`;
    }
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
    // 🛑 ISOLATION CHECK: 
    // Are we actually on the Report Page? If not, do NOTHING.
    const reportContainer = document.getElementById("user-reports-container");
    const barangaySelect = document.getElementById("barangay-select");
    
    // If these elements don't exist, we are likely on the Profile page. Stop here.
    if (!reportContainer && !barangaySelect) {
        return; 
    }

    console.log("Auth event:", event);

    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      loadUserReports();
      subscribeToReportUpdates(session.user.id);
      loadBarangays(); 
    
    } else if (event === 'SIGNED_OUT') {
      if (reportContainer) {
          reportContainer.innerHTML = `<p>Please log in to see your reports.</p>`;
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
// Initialize Report Form (Fixed: Dual Inputs for Camera/Gallery)
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

  // --- ENHANCED IMAGE UPLOAD HANDLING ---
  const imageUploadArea = document.getElementById("image-upload");
  const originalInput = document.getElementById("image-input");
  
  if (imageUploadArea && originalInput) {
    // 1. Clear old listeners by cloning the Upload Area
    const newImageUploadArea = imageUploadArea.cloneNode(true);
    imageUploadArea.replaceWith(newImageUploadArea);

    // 2. SETUP GALLERY INPUT (Existing)
    // We clone it to clear old listeners and ensure a fresh start
    const galleryInput = originalInput.cloneNode(true);
    galleryInput.id = "image-input-gallery"; // Rename to avoid confusion
    galleryInput.removeAttribute("capture");
    galleryInput.setAttribute("accept", "image/*");
    galleryInput.setAttribute("multiple", "true"); // Gallery allows multiple

    // 3. SETUP CAMERA INPUT (New Hidden Input)
    // This input is PERMANENTLY set to "Camera Mode"
    const cameraInput = originalInput.cloneNode(true);
    cameraInput.id = "image-input-camera";
    cameraInput.removeAttribute("multiple");       // Camera only takes 1 at a time
    cameraInput.setAttribute("accept", "image/*");
    cameraInput.setAttribute("capture", "environment"); // FORCE REAR CAMERA
    cameraInput.style.display = "none";

    // 4. Inject both inputs into the DOM
    originalInput.replaceWith(galleryInput);
    galleryInput.parentNode.insertBefore(cameraInput, galleryInput.nextSibling);

    // 5. Shared File Handler (Works for both inputs)
    const handleFileSelect = (e) => {
      // Handle the files
      if (e.target.files.length > 0) {
        // If multiple files (Gallery)
        if (e.target.files.length > 1) {
             Array.from(e.target.files).forEach(file => {
                 if (uploadedImages.length < MAX_IMAGES) handleImageUpload(file);
             });
        } 
        // If single file (Camera or Single Gallery)
        else {
             if (uploadedImages.length < MAX_IMAGES) handleImageUpload(e.target.files[0]);
        }
      }
      // Reset value so the same file can be selected again if needed
      e.target.value = ''; 
    };

    // Attach handler to BOTH inputs
    galleryInput.addEventListener("change", handleFileSelect);
    cameraInput.addEventListener("change", handleFileSelect);

    // 6. Click Listener for the Upload Box
    newImageUploadArea.addEventListener("click", () => {
      if (uploadedImages.length >= MAX_IMAGES) {
        alert(`Maximum ${MAX_IMAGES} images allowed`);
        return;
      }

      // Check Mobile
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      // DESKTOP: Just open Gallery (Camera not needed usually)
      if (!isMobile) {
        galleryInput.click();
        return;
      }

      // MOBILE: Show Custom Modal
      showImageSourceModal((choice) => {
        if (choice === 'camera') {
          console.log("📸 Opening Camera Input...");
          cameraInput.click(); // <--- HITS THE DEDICATED CAMERA INPUT
        } else {
          console.log("🖼️ Opening Gallery Input...");
          galleryInput.click(); // <--- HITS THE DEDICATED GALLERY INPUT
        }
      });
    });

    // 7. Drag and Drop Support (Desktop)
    newImageUploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      newImageUploadArea.classList.add("dragover");
    });
    newImageUploadArea.addEventListener("dragleave", () => {
      newImageUploadArea.classList.remove("dragover");
    });
    newImageUploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      newImageUploadArea.classList.remove("dragover");
      if (uploadedImages.length < MAX_IMAGES) {
        handleImageUpload(e.dataTransfer.files[0]);
      } else {
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

  // Contact Permission Logic
  const contactToggle = document.getElementById("contact-permission-toggle");
  const phoneContainer = document.getElementById("phone-input-container");
  const phoneInput = document.getElementById("contact-number");

  if (contactToggle) {
      contactToggle.addEventListener("change", () => {
          if (contactToggle.checked) {
              phoneContainer.style.display = "block";
              // Auto-fill logic
              const auth = getAuthState ? getAuthState() : null;
              if (auth && auth.user && auth.user.mobile) {
                  phoneInput.value = auth.user.mobile;
              }
          } else {
              phoneContainer.style.display = "none";
              phoneInput.value = "";
          }
      });
  }

  // Submit & Cancel Buttons
  const submitButton = document.getElementById("submit-report");
  if (submitButton) submitButton.addEventListener("click", submitOutageReport);

  const existingCancel = document.getElementById("cancel-report");
  if (!existingCancel && submitButton) {
    const cancelBtn = document.createElement("button");
    cancelBtn.id = "cancel-report";
    cancelBtn.textContent = "Cancel";
    cancelBtn.type = "button";
    cancelBtn.classList.add("cancel-button");
    cancelBtn.style.cssText = `
      margin-top:10px; width:100%; padding:10px; background:#eee;
      color:#333; border:none; border-radius:8px; font-weight:bold; cursor:pointer;
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
  // 1. Rate limiting check
  const now = Date.now();
  if (now - lastSubmissionTime < SUBMISSION_COOLDOWN) {
    alert(`Please wait a moment before submitting another report.`);
    return;
  }

  // 2. Online status check
  if (!checkOnlineStatus()) return;

  // 3. Form validation
  const validation = validateReportForm();
  if (!validation.isValid) {
    alert(validation.errors.join('\n'));
    return;
  }

  // 4. Gather Data
  const barangay = document.getElementById("barangay-select").value;
  const outageTime = document.getElementById("outage-time").value;
  const cause = document.getElementById("selected-cause").value;
  const description = document.getElementById("outage-description").value;
  const latitude = document.getElementById("latitude")?.value || null;
  const longitude = document.getElementById("longitude")?.value || null;
  const contactPermission = document.getElementById("contact-permission-toggle")?.checked || false;
  const contactNumber = document.getElementById("contact-number")?.value || null;
  const sentimentScore = calculateReportSentiment(description);

  // 5. Check Auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Please log in to submit a report");
    return;
  }

  // --- START LOADING SCREEN ---
  toggleLoadingScreen(true);

  try {
    // 6. ROBUST DUPLICATE HANDLING (Try Insert -> Catch -> Update)
    let finalReportData = null;

    // STEP A: Try to INSERT a fresh report
    const { data: insertedData, error: insertError } = await supabase
      .from("reports")
      .insert([{
        user_id: user.id,
        barangay: barangay,
        outage_time: outageTime,
        cause: cause,
        description: description,
        latitude: latitude,
        longitude: longitude,
        status: "pending", 
        sentiment_score: sentimentScore,
        contact_permission: contactPermission,
        contact_number: contactPermission ? contactNumber : null
      }])
      .select()
      .single();

    // STEP B: Check result
    if (!insertError) {
      // Success! New report created.
      finalReportData = insertedData;
    
    } else if (insertError.code === '23505') {
      // ERROR 23505 = "Unique Violation" (Duplicate Found)
      // This means a pending report already exists. We should UPDATE it instead.
      console.log("🔄 Duplicate detected. Updating existing pending report...");

      const { data: updatedData, error: updateError } = await supabase
        .from("reports")
        .update({
          outage_time: outageTime,      // Refresh timestamp
          description: description,     // Update description
          latitude: latitude,           // Update location if changed
          longitude: longitude,
          sentiment_score: sentimentScore
        })
        .eq('user_id', user.id)
        .eq('barangay', barangay)
        .eq('cause', cause)
        .eq('status', 'pending')        // STRICTLY target the pending one
        .select()
        .single();

      if (updateError) throw updateError;
      finalReportData = updatedData;

    } else {
      // Some other real error (e.g., network, permission)
      throw insertError;
    }

    // Assign to standard variable for the image upload section
    const reportData = finalReportData;

    // 7. Upload Images (if any)
    if (uploadedImages.length > 0) {
      for (const imageFile of uploadedImages) {
        const imagePath = `report_images/${user.id}/${reportData.id}/${Date.now()}_${imageFile.name}`;
        
        // Upload to Bucket
        const { error: uploadError } = await supabase.storage
          .from("report_images")
          .upload(imagePath, imageFile);
          
        if (uploadError) throw uploadError;

        // Get Public URL
        const { data: publicUrlData } = supabase.storage
          .from("report_images")
          .getPublicUrl(imagePath);

        // Link Image to Report
        await supabase.from("report_images").insert([{
          report_id: reportData.id,
          image_url: publicUrlData.publicUrl,
        }]);
      }
    }

    // 8. Success Cleanup
    lastSubmissionTime = now;
    showConfirmationPopup("✅ Report submitted successfully!");
    resetReportForm();
    loadUserReports();
    showPage("report");

  } catch (err) {
    console.error("❌ Error submitting report:", err);
    alert("Failed to submit report. Please try again.");
    
  } finally {
    // --- STOP LOADING SCREEN ---
    toggleLoadingScreen(false);
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
        ${report.contact_permission ? `<p><strong>Contact:</strong> ${report.contact_number}</p>` : ''}
        <p><strong>Status:</strong> <span class="status status-${report.status}">${report.status}</span></p>
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
// Para sa feedback ni SIR DON to avoid re-initialization issues
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

// ==============================
// Loading Screen Helper
// ==============================
function toggleLoadingScreen(show) {
  let loader = document.getElementById('full-screen-loader');
  
  // Create it if it doesn't exist
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'full-screen-loader';
    loader.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.8);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(2px);
    `;
    loader.innerHTML = `
      <div style="
        border: 4px solid #f3f3f3;
        border-top: 4px solid #f1c40f;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        animation: spin 1s linear infinite;
      "></div>
      <p style="margin-top: 15px; font-weight: bold; color: #333;">Submitting Report...</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(loader);
  }

  // Toggle visibility
  loader.style.display = show ? 'flex' : 'none';
}

// ==============================
// Image Source Selection Modal (Camera vs Gallery)
// ==============================
function showImageSourceModal(onSelect) {
  // 1. Create the Modal Elements
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.5); z-index: 10001;
    display: flex; justify-content: center; align-items: center;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    background: white; padding: 25px; border-radius: 12px;
    width: 90%; max-width: 320px; text-align: center;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  `;

  // 2. Title
  const title = document.createElement('h3');
  title.innerText = "Upload Photo";
  title.style.marginBottom = "20px";
  title.style.color = "#333";

  // 3. Camera Button
  const cameraBtn = document.createElement('button');
  cameraBtn.innerHTML = `<span class="material-symbols-outlined">photo_camera</span> Take Photo`;
  cameraBtn.style.cssText = `
    display: flex; align-items: center; justify-content: center; gap: 10px;
    width: 100%; padding: 12px; margin-bottom: 10px;
    background: #f1c40f; border: none; border-radius: 8px;
    font-size: 16px; font-weight: bold; cursor: pointer; color: #fff;
  `;
  cameraBtn.onclick = () => {
    onSelect('camera');
    modal.remove();
  };

  // 4. Gallery Button
  const galleryBtn = document.createElement('button');
  galleryBtn.innerHTML = `<span class="material-symbols-outlined">image</span> Open Gallery`;
  galleryBtn.style.cssText = `
    display: flex; align-items: center; justify-content: center; gap: 10px;
    width: 100%; padding: 12px; margin-bottom: 10px;
    background: #eee; border: none; border-radius: 8px;
    font-size: 16px; font-weight: bold; cursor: pointer; color: #333;
  `;
  galleryBtn.onclick = () => {
    onSelect('gallery');
    modal.remove();
  };

  // 5. Cancel Button
  const cancelBtn = document.createElement('button');
  cancelBtn.innerText = "Cancel";
  cancelBtn.style.cssText = `
    width: 100%; padding: 10px; background: transparent;
    border: none; color: #888; cursor: pointer; margin-top: 5px;
  `;
  cancelBtn.onclick = () => modal.remove();

  // Assemble
  box.appendChild(title);
  box.appendChild(cameraBtn);
  box.appendChild(galleryBtn);
  box.appendChild(cancelBtn);
  modal.appendChild(box);
  document.body.appendChild(modal);
  
  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}