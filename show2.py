import zipfile, xml.etree.ElementTree as ET
path=r"c:\Users\sk670\Downloads\D2C_Marketing_Calculator (1).xlsx"
ns={'main':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(path) as z:
    for name in z.namelist():
        if 'xl/worksheets/' in name:
            data=z.read(name)
            tree=ET.fromstring(data)
            cells=tree.findall('.//main:c',ns)
            matches=[(cell.attrib.get('r'), cell.find('main:f',ns).text if cell.find('main:f',ns) is not None else None) for cell in cells if cell.find('main:f',ns) is not None]
            if matches:
                print('---',name)
                for coord,formula in matches:
                    print(coord,formula)
