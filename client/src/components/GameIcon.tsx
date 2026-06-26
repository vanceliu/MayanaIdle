import { useState, useEffect } from 'react';

interface GameIconProps {
  name: string;
  size?: number;
  color?: string;
  className?: string;
}

const svgCache: Record<string, string> = {};

export function GameIcon({ name, size = 32, color, className = '' }: GameIconProps) {
  const [svgContent, setSvgContent] = useState<string>(svgCache[name] || '');

  useEffect(() => {
    if (svgCache[name]) {
      setSvgContent(svgCache[name]);
      return;
    }

    const modules = import.meta.glob('../assets/icons/**/*.svg', { query: '?raw', import: 'default' });
    const path = `../assets/icons/${name}.svg`;

    if (modules[path]) {
      (modules[path]() as Promise<string>).then((raw) => {
        svgCache[name] = raw;
        setSvgContent(raw);
      });
    }
  }, [name]);

  if (!svgContent) {
    return <span className={`game-icon game-icon--empty ${className}`} style={{ width: size, height: size }} />;
  }

  return (
    <span
      className={`game-icon ${className}`}
      style={{ width: size, height: size, color }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}
