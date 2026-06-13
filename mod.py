import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf8')
p = 'frontend/src/pages/Index.jsx'
with open(p, 'r', encoding='utf-8') as f:
    c = f.read()

old_str = '''                  onOpenMetric={setActiveMetricModal}
                />
              </div>'''

new_str = '''                  onOpenMetric={setActiveMetricModal}
                />
                <AiAnalysisBar watchId={selectedWatch} />
              </div>'''

c = c.replace(old_str, new_str)
with open(p, 'w', encoding='utf-8') as f:
    f.write(c)

print('Done')
