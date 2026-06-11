export async function fetchRoleAccess(role) {
  const res = await fetch(`/api/access-control/${encodeURIComponent(role)}`);
  if (!res.ok) {
    throw new Error(`Access API returned ${res.status}`);
  }
  return res.json();
}
