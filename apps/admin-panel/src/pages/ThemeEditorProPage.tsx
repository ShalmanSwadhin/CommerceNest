import { useParams } from 'react-router-dom';
import { ThemeBuilderPro } from '../features/theme-builder-pro/ThemeBuilderPro';
import { ErrorState } from '../components/QueryState';

/** Route wrapper for the isolated Theme Builder Pro (V1, beta) editor. */
export function ThemeEditorProPage() {
  const { storeId } = useParams();

  if (!storeId) {
    return <ErrorState message="No store selected." />;
  }

  return (
    <div className="-m-4 h-full md:-m-6">
      <ThemeBuilderPro storeId={storeId} />
    </div>
  );
}
