document.addEventListener('DOMContentLoaded', async () => {
    // Wait until Supabase is initialized
    if (!window.supabase) {
        await waitForSupabase();
    }

    initializeLogin();
});

function waitForSupabase(timeout = 5000) {
    return new Promise((resolve, reject) => {
        const interval = 50;
        let waited = 0;
        const check = () => {
            if (window.supabase) {
                resolve();
            } else if (waited >= timeout) {
                reject(new Error('Supabase not initialized in time'));
            } else {
                waited += interval;
                setTimeout(check, interval);
            }
        };
        check();
    });
}

function initializeLogin() {
    const loginButton = document.getElementById('login-button');
    const guestButton = document.getElementById('guest-button');

    if (loginButton) loginButton.addEventListener('click', loginUser);
    if (guestButton) guestButton.addEventListener('click', e => {
        e.preventDefault();
        continueAsGuest();
    });
}

async function loginUser(e) {
    e?.preventDefault();

    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;

    if (!identifier || !password) {
        alert('Enter email and password');
        return;
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: identifier, 
            password
        });

        if (error) {
            alert('Login failed: ' + error.message);
            return;
        }

        const user = data.user;
        if (!user) {
            alert('Login failed: no user returned');
            return;
        }

        currentUser = {
            id: user.id,
            email: user.email,
            firstName: user.user_metadata?.firstName || '',
            lastName: user.user_metadata?.lastName || '',
            mobile: user.user_metadata?.mobile || ''
        };

        // ✅ Remove guest flag on successful login
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        localStorage.removeItem('guest');

        // Redirect to main page
        window.location.href = 'index.html';

    } catch (err) {
        console.error(err);
        alert('Login error: ' + err.message);
    }
}


function continueAsGuest() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    localStorage.setItem('guest', 'true');
    window.location.href = 'index.html';
}
