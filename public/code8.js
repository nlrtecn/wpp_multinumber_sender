// code.js
document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    // Alterado de `document.body` para `document.documentElement` (o elemento <html>)
    const rootElement = document.documentElement; 

    // Função para aplicar o tema e atualizar o ícone/texto do botão
    function applyTheme(theme) {
        rootElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme); // Salva a preferência do usuário

        // Atualiza o ícone e texto do botão
        if (theme === 'dark') {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
            themeText.textContent = 'Mudar para Tema Claro';
            themeToggleBtn.setAttribute('aria-label', 'Ativar tema claro');
        } else {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
            themeText.textContent = 'Mudar para Tema Escuro';
            themeToggleBtn.setAttribute('aria-label', 'Ativar tema escuro');
        }
    }

    // Verifica a preferência do sistema ou o tema salvo no localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        // Se não há tema salvo, verifica a preferência do sistema
        applyTheme('dark');
    } else {
        // Padrão para tema claro se nenhuma preferência for encontrada
        applyTheme('light');
    }

    // Adiciona o listener para alternar o tema ao clicar no botão
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = rootElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(newTheme);
    });
});