// Dark mode toggle functionality
export function initializeDarkMode() {
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const logoImg = document.getElementById('logo-img') as HTMLImageElement;

    // Function to update the logo based on dark mode
    function updateLogo(isDarkMode: boolean) {
        if (logoImg) {
            logoImg.src = isDarkMode
                ? './images/darkmode/logo.png'
                : './images/lightmode/logo.png';
        }
    }

    // Check for saved preference or default to light mode
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode === 'enabled') {
        document.body.classList.add('dark-mode');
        updateLogo(true);
    } else {
        updateLogo(false);
    }

    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');

            // Update logo
            updateLogo(isDarkMode);

            // Save preference
            if (isDarkMode) {
                localStorage.setItem('darkMode', 'enabled');
            } else {
                localStorage.setItem('darkMode', 'disabled');
            }
        });
    }
}
