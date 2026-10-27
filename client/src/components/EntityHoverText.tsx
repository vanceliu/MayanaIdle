/**
 * 實體懸停名稱的內容（`16-tech-frontend-architecture.md` § 32.3.2）。
 * 有公會時兩行：上行金色《公會名》、下行角色名（`11-guild.md` § 11.7）。
 */
export function EntityHoverText({ text, guild }: { text: string; guild?: string }) {
  if (!guild) return <>{text}</>;
  return (
    <>
      <span className="entity-hover-guild">《{guild}》</span>
      <span className="entity-hover-name">{text}</span>
    </>
  );
}
