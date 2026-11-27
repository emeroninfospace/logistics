# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, strip_html


class LogisticsDeliveryNote(Document):
	def validate(self):
		self.set_defaults()
		self.calculate_totals()

	def set_defaults(self):
		if not self.company:
			self.company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
				"Global Defaults", "default_company"
			)

		if self.company and not self.company_address:
			self.company_address = get_company_address(self.company)

		if self.outbound and not self.invoice_no:
			self.invoice_no = self.outbound

		if self.ship_to_address:
			self.ship_to_address = html_to_text(self.ship_to_address)

		if self.ship_to and not self.ship_to_name:
			self.ship_to_name = frappe.db.get_value("Address", self.ship_to, "address_title")

	def calculate_totals(self):
		total_qty = total_weight = 0
		for row in self.items:
			total_qty += flt(row.qty)
			total_weight += flt(row.weight)

		self.total_qty = flt(total_qty, self.precision("total_qty"))
		self.total_weight = flt(total_weight, self.precision("total_weight"))


def html_to_text(value):
	"""Turn an HTML address (with <br> tags) into plain text, one line per row."""
	if not value:
		return value
	text = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
	text = strip_html(text)
	lines = [line.strip() for line in text.splitlines()]
	return "\n".join(line for line in lines if line)


def get_company_address(company):
	"""Return the primary (or first) address linked to the company."""
	addresses = frappe.get_all(
		"Address",
		filters=[
			["Dynamic Link", "link_doctype", "=", "Company"],
			["Dynamic Link", "link_name", "=", company],
			["Address", "disabled", "=", 0],
		],
		fields=["name", "is_primary_address"],
		order_by="is_primary_address desc, creation asc",
		limit=1,
	)
	return addresses[0].name if addresses else None


@frappe.whitelist()
def get_outbound_details(outbound):
	"""Values used to fill a Logistics Delivery Note from an Outbound."""
	doc = frappe.get_doc("Outbound", outbound)
	doc.check_permission("read")

	items = []
	for row in doc.items:
		description = strip_html(row.material_description or row.description or "").strip()
		items.append(
			{
				"part_no": row.part_no,
				"description": description or row.item_code,
				"uom": row.uom,
				"qty": flt(row.qty),
				"weight": flt(row.gross_wt) or flt(row.weight),
			}
		)

	if not items:
		frappe.throw(_("Outbound {0} has no items").format(outbound))

	return {
		"invoice_no": doc.name,
		"posting_date": doc.posting_date,
		"ship_to": doc.ship_to,
		"ship_to_name": frappe.db.get_value("Address", doc.ship_to, "address_title") if doc.ship_to else None,
		"ship_to_address": html_to_text(doc.ship_to_address),
		"total_package": doc.total_package,
		"items": items,
	}
