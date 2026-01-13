import frappe
from frappe import _

def get_data():
	return {
		"fieldname": "outbound",		
		"internal_links": {
			"Inbound": ["items", "reference_id"]
			
        },
		"transactions": [
			{"label": _("Transactions"), "items": ["Inbound"]},
						
		]
    }