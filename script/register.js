// Register Functions
function initializeRegister() {
    const registerButton = document.getElementById('register-button');
    if (registerButton) {
        registerButton.addEventListener('click', function() {
            registerUser();
        });
    }
    
    const verifyOtpButton = document.getElementById('verify-otp');
    if (verifyOtpButton) {
        verifyOtpButton.addEventListener('click', function() {
            verifyOtp();
        });
    }
}

function registerUser() {
    const firstName = document.getElementById('first-name').value;
    const lastName = document.getElementById('last-name').value;
    const mobile = document.getElementById('mobile-number').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const terms = document.getElementById('terms').checked;
    
    // Validation
    if (!firstName || !lastName || !mobile || !email || !password || !confirmPassword) {
        alert('Please fill in all required fields');
        return;
    }
    
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    if (!terms) {
        alert('Please accept the Terms and Conditions');
        return;
    }
    
    // In a real app, this would make an API call to register
    // For demo, we'll simulate OTP verification
    document.getElementById('otp-section').style.display = 'block';
    alert('OTP sent to your email. Please check and enter the code.');
}

function verifyOtp() {
    const otp = document.getElementById('otp-input').value;
    
    if (!otp) {
        alert('Please enter the OTP');
        return;
    }
    
    // In a real app, this would verify the OTP with the server
    // For demo, we'll assume any OTP is valid
    currentUser = {
        id: 1,
        firstName: document.getElementById('first-name').value,
        lastName: document.getElementById('last-name').value,
        email: document.getElementById('email').value,
        mobile: document.getElementById('mobile-number').value
    };
    
    // Save to localStorage
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    // Redirect to dashboard
    window.location.href = 'index.html';
}