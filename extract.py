import zipfile, re
path=r"c:\Users\sk670\Downloads\D2C_Marketing_Calculator (1).xlsx"
with zipfile.ZipFile(path) as z:
    for name in z.namelist():
        if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
            data=z.read(name).decode('utf-8')
            matches=re.findall(r'<c[^>]*?\s+r="([A-Z0-9]+)"[^>]*?>\s*(?:<f>(.*?)</f>)',data)
            if matches:
                print('---',name)
                for coord,formula in matches:
                    print(coord,formula)
