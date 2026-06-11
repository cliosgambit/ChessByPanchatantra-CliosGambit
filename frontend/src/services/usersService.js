import {
  fetchLoginUsers,
  subscribeToLoginUsers,
  unsubscribeChannel,
  createLoginUser,
  updateLoginUser,
  deleteLoginUser,
  pauseLoginUser,
  formatRoleLabel,
} from './loginService';

export { formatRoleLabel };

/** @typedef {import('../types').AppUser} AppUser */

export async function fetchUsers() {
  return fetchLoginUsers();
}

export function subscribeToUsers(callbacks) {
  return subscribeToLoginUsers(callbacks);
}

export { unsubscribeChannel, createLoginUser, updateLoginUser, deleteLoginUser, pauseLoginUser };
