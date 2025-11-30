<script lang="ts">
  import '../app.css';
  
  let { children } = $props();
  
  let isDark = $state(true);

  // Initialize dark mode on mount
  $effect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored === 'light') {
        isDark = false;
      } else if (stored === 'dark' || !stored) {
        isDark = true;
      }
    }
  });

  // Update document class when isDark changes
  $effect(() => {
    if (typeof document !== 'undefined') {
      if (isDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    }
  });

  function toggleTheme() {
    isDark = !isDark;
  }
</script>

<div class="min-h-screen bg-background text-text-primary transition-colors duration-200">
  <!-- Navigation Header -->
  <header class="border-b border-border bg-surface">
    <nav class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="text-xl font-bold text-accent-primary hover:text-accent-secondary transition-colors">
        🔐 Secrets
      </a>
      
      <div class="flex items-center gap-4">
        <a href="/vault" class="text-text-secondary hover:text-text-primary transition-colors">
          Vault
        </a>
        <a href="/dashboard" class="text-text-secondary hover:text-text-primary transition-colors">
          Dashboard
        </a>
        <a href="/register" class="text-text-secondary hover:text-text-primary transition-colors">
          Register
        </a>
        
        <button
          class="p-2 bg-surface-elevated border border-border rounded-lg hover:bg-background transition-colors"
          onclick={toggleTheme}
          aria-label="Toggle theme"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>
    </nav>
  </header>

  <!-- Main Content -->
  <main>
    {@render children()}
  </main>
</div>
