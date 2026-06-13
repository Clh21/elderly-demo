with open('frontend/src/pages/Index.jsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace('onOpenMetric={setActiveMetricModal}\n                />\n              </div>', 'onOpenMetric={setActiveMetricModal}\n                />\n                <AiAnalysisBar watchId={selectedWatch} />\n              </div>')
with open('frontend/src/pages/Index.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
