import { auth, provider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged } from "./firebaseConfig.js";
import { showToast, queueToast, checkPendingToast } from './toast.js';

// Show any queued toasts (e.g., "Signed out successfully" from app/dashboard)
document.addEventListener('DOMContentLoaded', checkPendingToast);

const form = document.getElementById("authForm");
const nameFieldGroup = document.getElementById("nameFieldGroup");
const fullnameInput = document.getElementById("fullname");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submitBtn");
const submitBtnText = submitBtn.querySelector("span");
const googleBtn = document.getElementById("googleBtn");
const toggleModeBtn = document.getElementById("toggleModeBtn");
const formTitle = document.getElementById("formTitle");
const formSubtitle = document.getElementById("formSubtitle");
const toggleText = document.getElementById("toggleText");
const authError = document.getElementById("authError");

let isLoginMode = true;

// Check if user is already logged in
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = "app.html";
    }
});

function showError(msg) {
    authError.textContent = msg;
    authError.classList.remove("hidden");
}

function hideError() {
    authError.classList.add("hidden");
    authError.textContent = "";
}

function setLoading(isLoading) {
    if (isLoading) {
        submitBtn.disabled = true;
        submitBtnText.textContent = "Please wait...";
        submitBtn.classList.add("opacity-70", "cursor-not-allowed");
    } else {
        submitBtn.disabled = false;
        submitBtnText.textContent = isLoginMode ? "Sign In" : "Create Account";
        submitBtn.classList.remove("opacity-70", "cursor-not-allowed");
    }
}

toggleModeBtn.addEventListener("click", () => {
    isLoginMode = !isLoginMode;
    hideError();
    if (isLoginMode) {
        formTitle.textContent = "Welcome back";
        formSubtitle.textContent = "Enter your credentials to access Aura.";
        submitBtnText.textContent = "Sign In";
        toggleText.textContent = "Don't have an account?";
        toggleModeBtn.textContent = "Sign Up";
        nameFieldGroup.classList.add("hidden");
        fullnameInput.required = false;
    } else {
        formTitle.textContent = "Create an account";
        formSubtitle.textContent = "Sign up to start analyzing sentiment.";
        submitBtnText.textContent = "Create Account";
        toggleText.textContent = "Already have an account?";
        toggleModeBtn.textContent = "Sign In";
        nameFieldGroup.classList.remove("hidden");
        fullnameInput.required = true;
    }
});

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();
    setLoading(true);

    const email = emailInput.value;
    const password = passwordInput.value;
    const fullname = fullnameInput.value;

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
            queueToast('Welcome back! Signed in successfully', 'success');
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, {
                displayName: fullname
            });
            queueToast('Account created successfully! Welcome to Aura', 'success');
        }
        // onAuthStateChanged will redirect
    } catch (error) {
        console.error(error);
        showError(error.message || "An error occurred during authentication.");
        showToast(error.message || 'Authentication failed', 'error');
        setLoading(false);
    }
});

googleBtn.addEventListener("click", async () => {
    hideError();
    try {
        await signInWithPopup(auth, provider);
        queueToast('Google sign-in successful!', 'success');
        // onAuthStateChanged will redirect
    } catch (error) {
        console.error(error);
        showError(error.message || "Google authentication failed.");
        showToast(error.message || 'Google authentication failed', 'error');
    }
});
