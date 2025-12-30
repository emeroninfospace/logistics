import frappe
from frappe import _

def get_data():
	return {
		"fieldname": "reference_id",		
		"internal_links": {
			"Outbound": ["items", "reference_id"]
			
        },
		"transactions": [
			{"label": _("Reference"), "items": ["Outbound"]},
						
		]
    }