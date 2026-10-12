<section id="clip-library" aria-labelledby="clip-library-title">
    <h2 id="clip-library-title">Saved clips</h2>
    <form id="clip-form">
      <label for="clip-id">Clip ID<input id="clip-id" type="text" maxlength="64" pattern="[A-Za-z0-9_-]+" required placeholder="clip1"></label>
      <label for="clip-file">Image or video<input id="clip-file" type="file" accept="image/*,video/*" required></label>
      <label for="clip-seconds">Image seconds<input id="clip-seconds" type="number" min="0.1" max="3600" step="0.1" value="3"></label>
      <button type="submit">Save clip</button>
    </form>
    <button id="save-text-clip" type="button">Save data URI</button>
    <p id="clip-status" role="status" aria-live="polite"></p>
    <p>Clips stay in this browser. Large videos may exceed browser storage.</p>
    <div id="clip-list" aria-label="Stored clips"></div>
  </section>
