import frappe
from frappe import _

def get_data():
	return {
		"fieldname": "outbound",		
		"internal_links": {
			"Job Order": ["items", "reference_id"]
			
        },
		"transactions": [
			{"label": _("Transactions"), "items": ["Job Order"]},
						
		]
    }