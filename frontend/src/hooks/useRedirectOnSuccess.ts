import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function useRedirectOnSuccess(isSuccess: boolean, path: string) {
  const navigate = useNavigate();

  useEffect(() => {
    if (isSuccess) {
      navigate(path);
    }
  }, [isSuccess, navigate, path]);
}
