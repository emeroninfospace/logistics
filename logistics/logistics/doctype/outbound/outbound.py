# Copyright (c) 2025, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import json
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt, cint


class Outbound(Document):
    def on_trash(self):
        self.update_inbound_item_balance_on_cancel()

    def on_update(self):
        self.valaidate_qty()
        self.update_inbound_item_balance_on_save()

    def before_submit(self):
        self.create_logistics_transactions()
        self.validate_boe()

    def before_cancel(self):
        self.update_logistics_transactions()
        self.update_inbound_item_balance_on_cancel()

    def on_submit(self):
        self.update_inbound_item_balance()
        self.update_inbound_status()

    def on_cancel(self):
        self.update_inbound_item_balance()
        self.update_inbound_status()


    def _get_inbound_qty_map(self, order_items):
        """Bulk fetch Inbound Item qty for a list of names -> {name: qty}"""
        if not order_items:
            return {}
        rows = frappe.db.get_all(
            "Inbound Item",
            filters={"name": ["in", order_items]},
            fields=["name", "qty"],
        )
        return {r.name: flt(r.qty) for r in rows}

    def _get_issued_qty_map(self, order_items, exclude_self=False):
       
        if not order_items:
            return {}

        params = {"order_items": order_items}
        exclude_clause = ""
        if exclude_self:
            exclude_clause = "AND o.name != %(name)s"
            params["name"] = self.name

        rows = frappe.db.sql(f"""
            SELECT oi.order_item, IFNULL(SUM(oi.qty), 0) as issued_qty
            FROM `tabOutbound Item` oi
            INNER JOIN `tabOutbound` o ON o.name = oi.parent
            WHERE oi.order_item IN %(order_items)s
            AND o.docstatus = 1
            {exclude_clause}
            GROUP BY oi.order_item
        """, params, as_dict=1)

        return {r.order_item: flt(r.issued_qty) for r in rows}


    def valaidate_qty(self):
        order_items = list({
            item.order_item for item in self.items
            if item.reference_id and item.order_item
        })
        if not order_items:
            return

        inbound_qty_map = self._get_inbound_qty_map(order_items)
        issued_map = self._get_issued_qty_map(order_items, exclude_self=True)

        for item in self.items:
            if not item.reference_id or not item.order_item:
                continue

            inbound_qty = inbound_qty_map.get(item.order_item, 0)
            already_issued = issued_map.get(item.order_item, 0)
            available_qty = inbound_qty - already_issued

            if flt(item.qty) > available_qty:
                frappe.throw(
                    f"Qty for item <b>{item.item_code}</b> exceeds available qty. "
                    f"Available: {available_qty}, Entered: {item.qty}"
                )


    def create_logistics_transactions(self):
        rows_with_ref = [item for item in self.items if item.reference_id]
        if not rows_with_ref:
            return

        reference_ids = list({item.reference_id for item in rows_with_ref})

        existing = frappe.db.get_all(
            "Logistics Transaction",
            filters={"reference_id": ["in", reference_ids]},
            fields=["name", "reference_id", "order_item", "item"],
        )
        existing_map = {
            (r.reference_id, r.order_item, r.item): r.name for r in existing
        }

        for item in rows_with_ref:
            lt_name = existing_map.get(
                (item.reference_id, item.order_item, item.item_code)
            )
            if not lt_name:
                continue

            frappe.db.set_value(
                "Logistics Transaction",
                lt_name,
                {
                    "out_qty": item.qty or 0,
                    "out_weight": item.gross_wt or 0,
                    "out_value": item.total_value or 0,
                    "outbound_id": self.name,
                    "outbound_item": item.name,
                },
                update_modified=False,
            )

    def update_logistics_transactions(self):
        rows_with_ref = [item for item in self.items if item.reference_id]
        if not rows_with_ref:
            return

        reference_ids = list({item.reference_id for item in rows_with_ref})

        existing = frappe.db.get_all(
            "Logistics Transaction",
            filters={"reference_id": ["in", reference_ids]},
            fields=["name", "reference_id", "order_item", "item"],
        )
        existing_map = {
            (r.reference_id, r.order_item, r.item): r.name for r in existing
        }

        for item in rows_with_ref:
            lt_name = existing_map.get(
                (item.reference_id, item.order_item, item.item_code)
            )
            if not lt_name:
                continue

            frappe.db.set_value(
                "Logistics Transaction",
                lt_name,
                {
                    "out_qty": 0,
                    "out_weight": 0,
                    "out_value": 0,
                    "outbound_id": "",
                    "outbound_item": "",
                },
                update_modified=False,
            )


    def update_inbound_status(self):
        job_order_ids = list({item.reference_id for item in self.items if item.reference_id})
        if not job_order_ids:
            return

        inbound_items = frappe.db.get_all(
            "Inbound Item",
            filters={"parent": ["in", job_order_ids]},
            fields=["name", "parent", "qty"],
        )
        order_item_names = [i.name for i in inbound_items]

        processed_map = {}
        if order_item_names:
            processed_rows = frappe.db.sql("""
                SELECT oi.order_item, IFNULL(SUM(oi.qty), 0) as processed_qty
                FROM `tabOutbound Item` oi
                INNER JOIN `tabOutbound` o ON oi.parent = o.name
                WHERE oi.order_item IN %(order_items)s
                AND o.docstatus = 1
                GROUP BY oi.order_item
            """, {"order_items": order_item_names}, as_dict=1)
            processed_map = {r.order_item: flt(r.processed_qty) for r in processed_rows}

        totals = {}
        for ii in inbound_items:
            t = totals.setdefault(ii.parent, {"total_qty": 0.0, "processed_qty": 0.0})
            t["total_qty"] += flt(ii.qty)
            t["processed_qty"] += processed_map.get(ii.name, 0)

        for job_order_id, t in totals.items():
            if t["processed_qty"] <= 0:
                status = "Pending"
            elif t["processed_qty"] >= t["total_qty"]:
                status = "Completed"
            else:
                status = "Partially"

            frappe.db.set_value("Inbound", job_order_id, "status", status, update_modified=False)

    def validate_unit_prices(self):
        for item in self.items:
            if not item.reference_id:
                continue

            inbound_item = frappe.db.get_value(
                "Inbound Item", item.order_item, ["unit_price", "parent"], as_dict=1
            )
            if not inbound_item:
                continue

            inbound_parent = frappe.db.get_value(
                "Inbound", inbound_item.parent, ["currency", "conversion_rate"], as_dict=1
            )

            inbound_conv_rate = flt(inbound_parent.conversion_rate) or 1
            inbound_currency = inbound_parent.currency or "AED"

            inbound_price_aed = (
                flt(inbound_item.unit_price) * inbound_conv_rate
                if inbound_currency != "AED"
                else flt(inbound_item.unit_price)
            )

            outbound_conv_rate = flt(self.conversion_rate) or 1
            outbound_currency = self.currency or "AED"

            outbound_price_aed = (
                flt(item.unit_price) * outbound_conv_rate
                if outbound_currency != "AED"
                else flt(item.unit_price)
            )

            inbound_price_aed = flt(inbound_price_aed, 4)
            outbound_price_aed = flt(outbound_price_aed, 4)

            if outbound_price_aed < inbound_price_aed:
                frappe.throw(
                    f"Rate mismatch for Item <b>{item.item_code}</b><br>"
                    f"Inbound Rate (<b>{inbound_price_aed:.4f}</b>) is higher than "
                    f"Outbound Rate (<b>{outbound_price_aed:.4f}</b>)."
                )

    def validate_boe(self):
        boe = frappe.db.get_single_value("Aliz Settings", "validate_boe_no")

        if not cint(boe):
            return

        for item in self.items:
            if not item.boe_no:
                frappe.throw(f"BOE No is required for item {item.item_code}.")


    def update_inbound_item_balance(self):
        """Called on submit/cancel — only counts submitted outbounds"""
        inbound_item_rows = list({item.order_item for item in self.items if item.order_item})
        if not inbound_item_rows:
            return

        inbound_qty_map = self._get_inbound_qty_map(inbound_item_rows)
        issued_map = self._get_issued_qty_map(inbound_item_rows, exclude_self=False)

        for row_name in inbound_item_rows:
            inbound_qty = inbound_qty_map.get(row_name, 0)
            issued_qty = issued_map.get(row_name, 0)
            balance_qty = inbound_qty - issued_qty

            if balance_qty < 0:
                frappe.throw(
                    f"Item {row_name}: Outbound qty exceeds Inbound qty"
                )

            frappe.db.set_value(
                "Inbound Item", row_name, "balance_qty",
                balance_qty, update_modified=False
            )

    def update_inbound_item_balance_on_save(self):
        """Called on save (draft) — only counts submitted, never drafts"""
        if self.is_new():
            return

        inbound_item_rows = list({item.order_item for item in self.items if item.order_item})
        if not inbound_item_rows:
            return

        inbound_qty_map = self._get_inbound_qty_map(inbound_item_rows)
        issued_map = self._get_issued_qty_map(inbound_item_rows, exclude_self=False)

        for row_name in inbound_item_rows:
            inbound_qty = inbound_qty_map.get(row_name, 0)
            issued_qty = issued_map.get(row_name, 0)
            balance_qty = max(0, inbound_qty - issued_qty)

            frappe.db.set_value(
                "Inbound Item", row_name, "balance_qty",
                balance_qty, update_modified=False
            )

    def update_inbound_item_balance_on_cancel(self):
        """Called on cancel/delete — excludes current doc"""
        inbound_item_rows = list({item.order_item for item in self.items if item.order_item})
        if not inbound_item_rows:
            return

        inbound_qty_map = self._get_inbound_qty_map(inbound_item_rows)
        issued_map = self._get_issued_qty_map(inbound_item_rows, exclude_self=True)

        for row_name in inbound_item_rows:
            inbound_qty = inbound_qty_map.get(row_name, 0)
            issued_qty = issued_map.get(row_name, 0)
            balance_qty = inbound_qty - issued_qty

            frappe.db.set_value(
                "Inbound Item", row_name, "balance_qty",
                balance_qty, update_modified=False
            )


@frappe.whitelist()
def get_job_order_items(job_order):
    if isinstance(job_order, str):
        job_order = json.loads(job_order)

    job_orders = frappe.get_all(
        "Inbound",
        filters={"name": ["in", job_order]},
        fields=["name", "boe_no", "currency", "conversion_rate"]
    )

    boe_map      = {jo.name: jo.boe_no         for jo in job_orders}
    currency_map = {jo.name: jo.currency        for jo in job_orders}
    rate_map     = {jo.name: jo.conversion_rate for jo in job_orders}

    items = frappe.get_all(
        "Inbound Item",
        filters={"parent": ["in", job_order]},
        fields=[
            "name", "parent", "item_code", "part_no",
            "description", "hs_code", "coo", "ref",
            "unit_wt", "gross_wt", "qty", "unit_price",
            "hs_description", "uom"
        ]
    )

    item_names = [i.name for i in items]
    consumed_map = {}
    if item_names:
        consumed_rows = frappe.db.sql("""
            SELECT oi.order_item, IFNULL(SUM(oi.qty), 0) as total_qty
            FROM `tabOutbound Item` oi
            INNER JOIN `tabOutbound` o ON o.name = oi.parent
            WHERE oi.order_item IN %(items)s
            AND o.docstatus = 1
            GROUP BY oi.order_item
        """, {"items": item_names}, as_dict=1)
        consumed_map = {r.order_item: flt(r.total_qty) for r in consumed_rows}

    for item in items:
        item["boe_no"]                  = boe_map.get(item.parent)
        item["inbound_currency"]        = currency_map.get(item.parent, "AED")
        item["inbound_conversion_rate"] = rate_map.get(item.parent, 1)

        item["consumed_qty"] = consumed_map.get(item.name, 0)
        item["balance_qty"]  = item["qty"] - item["consumed_qty"]

    return items


def get_consumed_qty(order_item_name):
    """Kept for backward compatibility if called elsewhere for a single row."""
    consumed = frappe.db.sql("""
        SELECT IFNULL(SUM(oi.qty), 0) as total_qty
        FROM `tabOutbound Item` oi
        INNER JOIN `tabOutbound` o ON o.name = oi.parent
        WHERE oi.order_item = %s
        AND o.docstatus = 1
    """, (order_item_name,), as_dict=1)

    return consumed[0].total_qty if consumed else 0


@frappe.whitelist()
def get_consolidated_hs_rows(docname):
    doc = frappe.get_doc("Outbound", docname)
    consolidated = {}

    for item in doc.items:
        key = (item.hs_code or "N/A") + "||" + (item.coo or "N/A")

        if key not in consolidated:
            consolidated[key] = {
                "hs_code":     item.hs_code or "N/A",
                "description": item.material_description or item.item_code or "",
                "coo":         item.coo or "N/A",
                "qty":         flt(item.qty),
                "gross_wt":    flt(item.gross_wt),
                "total_value": flt(item.total_value)
            }
        else:
            consolidated[key]["qty"]         += flt(item.qty)
            consolidated[key]["gross_wt"]    += flt(item.gross_wt)
            consolidated[key]["total_value"] += flt(item.total_value)

    return list(consolidated.values())