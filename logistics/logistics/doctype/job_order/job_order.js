// // Copyright (c) 2025, Emeron Infospace and contributors
// // For license information, please see license.txt

// frappe.ui.form.on("Job Order", {
// 	onload: function(frm) {
//         if (!frm.doc.company && frappe.defaults.get_user_default("Company")) {
//             frm.set_value(
//                 'company',
//                 frappe.defaults.get_user_default("Company")
//             );
//         }
//     },
//     customer_address: function (frm) {
// 		if (frm.doc.customer) {
// 			frappe.call({
// 				method: "frappe.contacts.doctype.address.address.get_address_display",
// 				args: {
// 					address_dict: frm.doc.customer_address,
// 				},
// 				callback: function (r) {
// 					frm.set_value("customer_address", r.message);
// 				},
// 			});
//         }
// 		if (!frm.doc.customer_address) {
// 			frm.set_value("customer_address", "");
// 		}
// 	},
// });
