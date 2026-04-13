from pathlib import Path
path = Path('app/dashboard/page.tsx')
text = path.read_text()
start = text.index('<motion.section className= surface section-surface variants={fadeUp}>')
end = text.index('<motion.section className=surface checklist-surface variants={fadeUp}>', start)
text = text[:start] + text[end:]
path.write_text(text)
