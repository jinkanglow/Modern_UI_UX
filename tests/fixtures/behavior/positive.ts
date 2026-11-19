export function legacyFeedback() {
  window.alert('Saved');
  const accepted = confirm('Proceed?');
  const value = window.prompt('Name');
  document.write('<p>Legacy</p>');
  return { accepted, value };
}
