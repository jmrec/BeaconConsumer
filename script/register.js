// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    initializeRegister();
});

function initializeRegister() {
    const registerButton = document.getElementById('register-button');
    if (registerButton) {
        registerButton.addEventListener('click', function(e) {
            e.preventDefault(); // Prevent form submission reload
            registerUser();
        });
    }
}

async function registerUser() {
    // 1. Get Values
    const firstName = document.getElementById('first-name').value;
    const lastName = document.getElementById('last-name').value;
    const mobile = document.getElementById('mobile-number').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const terms = document.getElementById('terms').checked;
    
    const registerBtn = document.getElementById('register-button');

    // 2. Client-side Validation
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

    // 3. UI State: Processing
    registerBtn.disabled = true;
    registerBtn.textContent = "Processing...";

    // 4. Supabase Sign Up
    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                // These fields are passed to the 'profiles' table via your DB Trigger
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    mobile: mobile,
                    role: 'user' 
                    // Note: 'barangay' is omitted here. 
                    // The DB will set it to default 'Not set'.
                }
            }
        });

        if (error) throw error;

        // 5. Success Handling
        // Update the success message with the user's email for clarity
        document.getElementById('display-email').textContent = email;
        
        // Hide form, show success message
        document.getElementById('registration-form').style.display = 'none';
        document.getElementById('success-message').style.display = 'block';
        
    } catch (error) {
        console.error('Registration Error:', error);
        alert('Error registering: ' + error.message);
        
        // Reset button state
        registerBtn.disabled = false;
        registerBtn.textContent = "Create Account";
    }
}