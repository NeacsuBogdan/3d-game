export function normalizeUsername(input: string): string {
  const trimmed = input.trim().toLowerCase();
  // remove spaces, keep [a-z0-9_]
  return trimmed.replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '');
}

export function validateUsername(u: string): string | null {
  if (!u) return 'Username is required';
  if (!/^[a-z][a-z0-9_]*$/.test(u)) {
    return 'Must start with a letter and contain only letters, digits, or underscore';
  }
  if (u.length < 3 || u.length > 20) {
    return 'Must be between 3 and 20 characters';
  }
  return null;
}
