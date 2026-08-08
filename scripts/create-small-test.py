import openpyxl
import os

wb = openpyxl.Workbook()
ws = wb.active
ws.title = 'orders'
ws.append(['external_order_no','store_code','customer_name','customer_phone','delivery_address','sku_code','sku_name','quantity','unit_price','remarks'])
ws.append(['EXT00001','STORE001','test','13800138000','addr1','SKU_00001','item1',1,100,'note'])
path = r'd:\kaoshi\new\qiancheng0605v1\test-data\small-test.xlsx'
wb.save(path)
print(f'File size: {os.path.getsize(path)} bytes')
