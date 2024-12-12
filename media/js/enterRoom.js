+(function () {
    function setUrl(cb) {
        const urlObj = new URL(window.location.href);
        const paramsData = getQueryParams(urlObj);
        urlObj.searchParams.delete("originUrl");
        const updatedUrl = urlObj;
        const url = `/account/enterRoom?${updatedUrl.searchParams}`;
        cb({ url, paramsData });
    }
    setUrl(function (data) {
        const { url, paramsData } = data;
        if (
            paramsData.username &&
            paramsData.description &&
            paramsData.branch_name
        ) {
            $.ajax({
                type: "GET",
                url: url,
                dataType: "json",
            }).then(function (data) {
                localStorage.setItem("originUrl", paramsData.originUrl);
                window.location.href = data;
            });
        } else {
            swal("Error", "Lỗi khi kết nối ", "error");
        }
    });

    function getQueryParams(urlObj) {
        const params = {};
        urlObj.searchParams.forEach((value, key) => {
            params[key] = value;
        });

        return params;
    }
})();
