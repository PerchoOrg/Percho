(function(){
  const KEY = 'percho-proto:theme';
  const t = localStorage.getItem(KEY) || 'light';
  if (t === 'dark') document.documentElement.classList.add('dark');
  window.addEventListener('DOMContentLoaded', () => {
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.innerHTML = document.documentElement.classList.contains('dark') ? '☀ Light' : '☾ Dark';
    btn.onclick = () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem(KEY, isDark ? 'dark' : 'light');
      btn.innerHTML = isDark ? '☀ Light' : '☾ Dark';
    };
    document.body.appendChild(btn);
  });
})();
