import zipfile
path=r"c:\Users\sk670\Downloads\D2C_Marketing_Calculator (1).xlsx"
with zipfile.ZipFile(path) as z:
    for name in z.namelist():
        if name.startswith('xl/worksheets/sheet1.xml'):
            print(z.read(name)[:1000].decode('utf-8','ignore'))
