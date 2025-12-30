import frappe
from frappe import _

def get_data():
	return {
		"fieldname": "outbound",		
		"internal_links": {
			"Commercial Invoice": ["items", "outbound"]
			
        },
		"transactions": [
			{"label": _("Reference"), "items": ["Commercial Invoice"]},
						
		]
    }