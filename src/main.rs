use resource_model_macro::resource_model;

resource_model! {
    r#"
version: 1
config:
  visibility: "pub"
  backend: "postgres"
entities:
  - name: "User"
    table: "users"
    id: { name: "id", type: "uuid" }
    fields:
      - { name: "name", type: "string", required: true }
      - { name: "email", type: "string", required: true, unique: true }
      - { name: "age", type: "int", required: true }
  - name: "Post"
    table: "posts"
    id: { name: "id", type: "uuid" }
    fields:
      - { name: "title", type: "string", required: true }
      - { name: "content", type: "string", required: true }
      - name: "user_id"
        type: "uuid"
        required: true
        references: { entity: "User", field: "id" }
  - name: "Comment"
    table: "comments"
    id: { name: "id", type: "uuid" }
    fields:
      - { name: "content", type: "string", required: true }
      - name: "post_id"
        type: "uuid"
        required: true
        references: { entity: "Post", field: "id" }
      - name: "author_id"
        type: "uuid"
        required: true
        references: { entity: "User", field: "id" }
relations:
  - { name: "owned_posts", kind: "has_many", source: "User", target: "Post", foreign_key: "user_id" }
  - { name: "comments", kind: "has_many", source: "Post", target: "Comment", foreign_key: "post_id" }
  - { name: "author", kind: "belongs_to", source: "Comment", target: "User", foreign_key: "author_id" }
  - { name: "post", kind: "belongs_to", source: "Comment", target: "Post", foreign_key: "post_id" }
    "#
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = sqlx::PgPool::connect(&db_url).await?;

    migrate(&pool).await?;
    println!("migrations applied");

    let users = SqlxUserRepository::new(pool.clone());
    let posts = SqlxPostRepository::new(pool.clone());
    let _comments = SqlxCommentRepository::new(pool.clone());

    // ── Create ─────────────────────────────────────────────
    let email = format!("alice+{}@example.com", uuid::Uuid::new_v4());
    let alice = users
        .create(CreateUser {
            name: "Alice".into(),
            email,
            age: 20,
        })
        .await?;
    println!("created: {:?}", alice);

    let post = posts
        .create(CreatePost {
            title: "First post".into(),
            content: "Hello world".into(),
            user_id: alice.id,
        })
        .await?;
    println!("created: {:?}", post);

    // ── Read ───────────────────────────────────────────────
    let found = users.find_by_id(alice.id).await?;
    println!("find_by_id: {found:?}");

    let all_users = users.list().await?;
    println!("list: {} user(s)", all_users.len());

    // ── Update (partial — only title changes) ──────────────
    let updated = posts
        .update(
            post.id,
            UpdatePost {
                title: Some("Renamed".into()),
                content: None,
                user_id: None,
            },
        )
        .await?;
    println!("updated: {updated:?}");

    // ── Relations ──────────────────────────────────────────
    let alice_posts = users.owned_posts(alice.id).await?;
    println!("alice's posts: {}", alice_posts.len());

    let post_comments = posts.comments(post.id).await?;
    println!("post comments: {}", post_comments.len());

    // ── Delete ─────────────────────────────────────────────
    let removed = posts.delete(post.id).await?;
    println!("deleted post: {removed}");

    let removed = users.delete(alice.id).await?;
    println!("deleted user: {removed}");

    Ok(())
}
