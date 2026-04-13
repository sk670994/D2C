from pathlib import Path
path=Path('components/competitive-radar/CompetitiveRadarPanel.tsx')
text=path.read_text()
text=text.replace('size="sm"','')
path.write_text(text)
