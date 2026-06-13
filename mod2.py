import re
p = 'frontend/src/pages/Index.jsx'
with open(p, 'r', encoding='utf-8') as f:
    c = f.read()

c = re.sub(
    r'(onOpenMetric=\{setActiveMetricModal\}\s*/>\s*</div>)',
    r'\1\n                <AiAnalysisBar watchId={selectedWatch} />',
    c
)

with open(p, 'w', encoding='utf-8', newline='') as f:
    f.write(c)
print('Done')
