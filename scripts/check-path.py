import json
import re

with open(r'C:\Users\Public\Projects\desktop\miku-warp\docs.local\avatar-xhr.md', encoding='utf-8') as f:
    content = f.read().strip()

for a, b in [
    ('\\_', '_'),
    ('\\[', '['),
    ('\\]', ']'),
    ('\\(', '('),
    ('\\)', ')'),
    ('\\.', '.'),
]:
    content = content.replace(a, b)

prev = None
while prev != content:
    prev = content
    content = content.replace('\\\\', '\\')

content = re.sub(r'\\([^"\\/bfnrtu])', r'\1', content)
data = json.loads(content)
alist = data['data']['avatar_list']

keys = set()
for av in alist:
    keys.update(av.keys())
print('All avatar keys:', sorted(keys))

matches = re.findall(r'"[^"]*[Pp]ath[^"]*"', content)
print('path-like keys:', sorted(set(matches))[:20])
