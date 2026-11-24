import { Link, useLocation, useNavigate } from 'react-router-dom';

const backLinkStyle = { marginBottom: 16, display: 'inline-block' } as const;

/** 詳細頁返回連結（`43-wiki-system.md` § 4「詳細頁返回連結」）：站內點進來返回上一頁；直接開啟連到列表頁 */
export function WikiBackLink({ listPath, listLabel }: { listPath: string; listLabel: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  if (location.key === 'default') {
    return <Link className="wiki-link" to={listPath} style={backLinkStyle}>← {listLabel}</Link>;
  }
  return (
    <Link
      className="wiki-link"
      to={listPath}
      style={backLinkStyle}
      onClick={e => { e.preventDefault(); navigate(-1); }}
    >
      ← 返回上一頁
    </Link>
  );
}
