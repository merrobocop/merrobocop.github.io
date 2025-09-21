// main.js — минимальная логика для проекта
(function(){
  'use strict';
  // Theme toggle
  const btn = document.getElementById('theme-toggle');
  const root = document.documentElement;
  // load preference
  const saved = localStorage.getItem('xsoft-theme');
  if(saved==='light') document.documentElement.classList.add('light');

  if(btn){
    btn.addEventListener('click', () => {
      const isLight = document.documentElement.classList.toggle('light');
      localStorage.setItem('xsoft-theme', isLight ? 'light' : 'dark');
    });
  }

  // Simple UA-based enhancement: show downloadable filenames in console
  document.addEventListener('DOMContentLoaded', () => {
    const links = document.querySelectorAll('a[download]');
    links.forEach(a => {
      a.addEventListener('click', () => {
        console.log('Пользователь скачивает:', a.getAttribute('href'));
      });
    });
  });

})();
