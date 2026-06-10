require "test_helper"

class SessionsControllerTest < ActionDispatch::IntegrationTest
  test "GET /login renders the login page" do
    get login_path
    assert_response :ok
    assert_select "form"
  end

  test "GET /login redirects to root if already logged in" do
    post guest_session_path, params: { username: "Already" }
    get login_path
    assert_redirected_to root_path
  end

  test "POST /sessions/guest with valid username creates session and redirects to root" do
    assert_difference "User.count", 1 do
      post guest_session_path, params: { username: "Rider99" }
    end
    assert_redirected_to root_path
    follow_redirect!
    assert_response :ok
  end

  test "POST /sessions/guest without username redirects back with error" do
    assert_no_difference "User.count" do
      post guest_session_path, params: { username: "" }
    end
    assert_redirected_to login_path
  end

  # Sends POST with _method=DELETE as the browser form does (Rack::MethodOverride must be wired up)
  test "POST /logout with _method=DELETE logs out via form submission" do
    post guest_session_path, params: { username: "FormUser" }
    assert_redirected_to root_path

    post logout_path, params: { "_method" => "DELETE" }
    assert_redirected_to login_path

    get root_path
    assert_redirected_to login_path
  end

  test "DELETE /logout clears session and redirects to login" do
    post guest_session_path, params: { username: "TempUser" }
    assert_redirected_to root_path

    delete logout_path
    assert_redirected_to login_path

    # after logout, root redirects back to login
    get root_path
    assert_redirected_to login_path
  end
end
