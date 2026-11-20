import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

/** Stock quantity is ledger-driven; open the balance details instead of a carton edit form. */
const EditStock = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    navigate(id ? `/stock/${id}` : '/stock', { replace: true });
  }, [id, navigate]);

  return null;
};

export default EditStock;
