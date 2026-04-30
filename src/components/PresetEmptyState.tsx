const PresetEmptyState = () => {
  return (
    <div class="flex flex-col items-center justify-center py-20">
      {/* Sliders / presets icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-text-muted mb-4"
        aria-hidden="true"
      >
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
        <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
        <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
        <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
      </svg>

      <p class="font-section-header text-text-secondary mb-1">No presets yet</p>
      <p class="font-body text-text-muted">Create your first preset to get started</p>
    </div>
  );
};

export default PresetEmptyState;
