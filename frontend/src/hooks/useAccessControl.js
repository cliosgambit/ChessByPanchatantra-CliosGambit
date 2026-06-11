import { useState, useEffect } from 'react';
import { useAuth } from '../AppContext';

export const useAccessControl = () => {
  const { user } = useAuth();
  const [userAccess, setUserAccess] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setUserAccess(null);
      setLoading(false);
      return;
    }

    const fetchUserAccess = async () => {
      try {
        const response = await fetch(`/api/access-control/${user.role}`);
        if (response.ok) {
          const data = await response.json();
          setUserAccess(data);
        } else {
          setUserAccess(null);
        }
      } catch (error) {
        console.error('Error fetching user access:', error);
        setUserAccess(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserAccess();
  }, [user]);

  const hasModuleAccess = (moduleId) => {
    if (!user || user.role === 'admin') return true;
    if (!userAccess) return false;
    return userAccess.mod_access && userAccess.mod_access.includes(moduleId);
  };

  const hasChapterAccess = (chapterId) => {
    if (!user || user.role === 'admin') return true;
    if (!userAccess) return false;
    return userAccess.chap_access && userAccess.chap_access.includes(chapterId);
  };

  const hasStoryAccess = (storyId) => {
    if (!user || user.role === 'admin') return true;
    if (!userAccess) return false;
    return userAccess.story_access && userAccess.story_access.includes(storyId);
  };

  return {
    userAccess,
    loading,
    hasModuleAccess,
    hasChapterAccess,
    hasStoryAccess,
  };
}; 