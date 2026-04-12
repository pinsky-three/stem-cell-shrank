mod codegen;
mod spec;
mod validate;

use proc_macro::TokenStream;
use syn::{parse_macro_input, LitStr};

fn process_yaml(yaml_str: &str) -> TokenStream {
    let spec: spec::SystemsSpec = match serde_yaml::from_str(yaml_str) {
        Ok(s) => s,
        Err(e) => {
            let msg = format!("system_model!: failed to parse YAML: {e}");
            return quote::quote! { compile_error!(#msg); }.into();
        }
    };

    let errors = validate::validate(&spec);
    if !errors.is_empty() {
        let msgs: Vec<proc_macro2::TokenStream> = errors
            .iter()
            .map(|e| {
                let msg = format!("system_model!: {e}");
                quote::quote! { compile_error!(#msg); }
            })
            .collect();
        return quote::quote! { #(#msgs)* }.into();
    }

    codegen::generate(&spec).into()
}

/// Accepts an inline YAML string literal.
#[proc_macro]
pub fn system_model(input: TokenStream) -> TokenStream {
    let lit = parse_macro_input!(input as LitStr);
    process_yaml(&lit.value())
}

/// Accepts a file path (relative to the crate root) and reads the YAML at compile time.
#[proc_macro]
pub fn system_model_file(input: TokenStream) -> TokenStream {
    let lit = parse_macro_input!(input as LitStr);
    let rel_path = lit.value();

    let manifest_dir = match std::env::var("CARGO_MANIFEST_DIR") {
        Ok(d) => d,
        Err(_) => {
            return quote::quote! {
                compile_error!("system_model_file!: CARGO_MANIFEST_DIR not set");
            }
            .into();
        }
    };

    let full_path = std::path::Path::new(&manifest_dir).join(&rel_path);
    let yaml_str = match std::fs::read_to_string(&full_path) {
        Ok(s) => s,
        Err(e) => {
            let msg = format!(
                "system_model_file!: cannot read '{}': {e}",
                full_path.display()
            );
            return quote::quote! { compile_error!(#msg); }.into();
        }
    };

    process_yaml(&yaml_str)
}
