import CustomGamePage from './test/CustomGamePage';
import './TestPage.css';

/** Chess analysis test page — board, move history, engine panel, brilliance stages. */
export default function TestPage() {
  return (
    <CustomGamePage
      boardId="TestBoard"
      inputSource="test"
      hideBrilliancePanel
    />
  );
}
